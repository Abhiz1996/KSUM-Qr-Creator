const crypto = require("crypto");

const STORE_KEY = "ksum-qr-store";
let memoryStore = defaultStore();

function storageConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

function defaultStore() {
  return { qrs: [], scans: [] };
}

async function redis(command, ...args) {
  const { url, token } = storageConfig();
  if (!url || !token) {
    const error = new Error("Storage is not configured. Add Vercel KV or Upstash Redis env vars.");
    error.code = "NO_STORAGE";
    throw error;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([command, ...args])
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text || "Redis returned a non-JSON response." };
  }
  if (!response.ok || data.error) throw new Error(data.error || "Redis command failed.");
  return data.result;
}

async function loadStore() {
  if (!storageConfig().url || !storageConfig().token) return memoryStore;
  const raw = await redis("GET", STORE_KEY);
  if (!raw) return defaultStore();
  try {
    return JSON.parse(raw);
  } catch {
    return defaultStore();
  }
}

async function saveStore(store) {
  if (!storageConfig().url || !storageConfig().token) {
    memoryStore = store;
    return;
  }
  await redis("SET", STORE_KEY, JSON.stringify(store));
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  if (error.code === "NO_STORAGE") return send(res, 503, { error: error.message });
  return send(res, 500, { error: error.message || "Server error." });
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function readBody(req) {
  return new Promise(resolve => {
    if (req.body !== undefined) return resolve(parseBody(req));
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      resolve(parseBody({ body }));
    });
    req.on("error", () => {
      resolve({});
    });
  });
}

function normalizeQr(input) {
  const now = new Date().toISOString();
  const id = input.id || crypto.randomBytes(4).toString("hex");
  return {
    id,
    name: String(input.name || "Untitled QR").trim().slice(0, 80),
    type: String(input.type || "url"),
    destination: String(input.destination || "").trim(),
    payload: String(input.payload || input.destination || "").trim(),
    dynamic: input.dynamic !== false,
    style: {
      foreground: input.style?.foreground || "#111827",
      background: input.style?.background || "#ffffff",
      accent: input.style?.accent || "#2dd4bf",
      frame: input.style?.frame || "none",
      logoText: String(input.style?.logoText || "").slice(0, 3).toUpperCase(),
      margin: Number(input.style?.margin ?? 4),
      size: Number(input.style?.size ?? 280),
      errorCorrection: input.style?.errorCorrection || "M"
    },
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function publicQr(qr, req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = `${proto}://${req.headers.host}`;
  return { ...qr, shortUrl: `${origin}/r/${qr.id}` };
}

function aggregate(qr, scans) {
  const qrScans = Array.isArray(scans) ? scans.filter(scan => scan.qrId === qr.id) : scans[qr.id] || [];
  const uniqueVisitors = new Set(qrScans.map(scan => scan.ipHash)).size;
  const topLocations = Object.entries(qrScans.reduce((acc, scan) => {
    const label = scan.location?.label || "Unknown";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {}))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const byDay = qrScans.reduce((acc, scan) => {
    const day = scan.time.slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  return {
    totalScans: qrScans.length,
    uniqueVisitors,
    lastScanAt: qrScans[0]?.time || null,
    topLocation: topLocations[0]?.label || "Unknown",
    locations: topLocations,
    byDay,
    recentScans: qrScans.slice(0, 25)
  };
}

function buildPayload(qr) {
  if (qr.dynamic) return qr.shortUrl || qr.destination;
  return qr.payload || qr.destination;
}

function withAnalytics(qr, req, scans) {
  const enriched = publicQr(qr, req);
  return { ...enriched, payload: buildPayload(enriched), analytics: aggregate(qr, scans) };
}

function groupScansByQr(scans) {
  return scans.reduce((groups, scan) => {
    if (!groups[scan.qrId]) groups[scan.qrId] = [];
    groups[scan.qrId].push(scan);
    return groups;
  }, {});
}

function withAnalyticsList(qrs, req, scans) {
  const groupedScans = groupScansByQr(scans);
  return qrs.map(qr => withAnalytics(qr, req, groupedScans));
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function parseAgent(agent = "") {
  const ua = agent.toLowerCase();
  const device = /mobile|iphone|android/.test(ua) ? "Mobile" : /ipad|tablet/.test(ua) ? "Tablet" : "Desktop";
  const browser = ua.includes("edg/") ? "Edge" : ua.includes("chrome/") ? "Chrome" : ua.includes("safari/") ? "Safari" : ua.includes("firefox/") ? "Firefox" : "Other";
  const os = ua.includes("windows") ? "Windows" : ua.includes("mac os") ? "macOS" : ua.includes("android") ? "Android" : ua.includes("iphone") || ua.includes("ipad") ? "iOS" : ua.includes("linux") ? "Linux" : "Other";
  return { device, browser, os };
}

function referrerLabel(value) {
  if (!value) return "Direct";
  try {
    return new URL(value).hostname || "Unknown";
  } catch {
    return "Unknown";
  }
}

function decodeHeader(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function scanLocation(req) {
  const city = decodeHeader(req.headers["x-vercel-ip-city"]);
  const region = decodeHeader(req.headers["x-vercel-ip-country-region"]);
  const country = decodeHeader(req.headers["x-vercel-ip-country"]);
  const latitude = decodeHeader(req.headers["x-vercel-ip-latitude"]);
  const longitude = decodeHeader(req.headers["x-vercel-ip-longitude"]);
  const postalCode = decodeHeader(req.headers["x-vercel-ip-postal-code"]);
  const parts = [city, region, country].filter(Boolean);
  return {
    city: city || "Unknown",
    region: region || "",
    country: country || "",
    latitude: latitude || "",
    longitude: longitude || "",
    postalCode: postalCode || "",
    label: parts.length ? parts.join(", ") : "Unknown"
  };
}

function scanRecord(req, qrId) {
  const ip = clientIp(req);
  return {
    id: crypto.randomBytes(6).toString("hex"),
    qrId,
    time: new Date().toISOString(),
    ipHash: crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16),
    referrerLabel: referrerLabel(req.headers.referer || ""),
    userAgent: req.headers["user-agent"] || "Unknown",
    location: scanLocation(req),
    ...parseAgent(req.headers["user-agent"] || "")
  };
}

module.exports = {
  loadStore,
  saveStore,
  send,
  sendError,
  parseBody,
  readBody,
  normalizeQr,
  withAnalytics,
  withAnalyticsList,
  scanRecord
};
