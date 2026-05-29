const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "store.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

function defaultStore() {
  return { qrs: [], scans: [] };
}

function loadStore() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return defaultStore();
  }
}

function saveStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return String(forwarded || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function parseAgent(agent = "") {
  const ua = agent.toLowerCase();
  const device = /mobile|iphone|android/.test(ua) ? "Mobile" : /ipad|tablet/.test(ua) ? "Tablet" : "Desktop";
  const browser = ua.includes("edg/") ? "Edge" : ua.includes("chrome/") ? "Chrome" : ua.includes("safari/") ? "Safari" : ua.includes("firefox/") ? "Firefox" : "Other";
  const os = ua.includes("windows") ? "Windows" : ua.includes("mac os") ? "macOS" : ua.includes("android") ? "Android" : ua.includes("iphone") || ua.includes("ipad") ? "iOS" : ua.includes("linux") ? "Linux" : "Other";
  return { device, browser, os };
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
  const origin = `http://${req.headers.host}`;
  return { ...qr, shortUrl: `${origin}/r/${qr.id}` };
}

function aggregate(qr, scans) {
  const qrScans = scans.filter(scan => scan.qrId === qr.id);
  const uniqueVisitors = new Set(qrScans.map(scan => scan.ipHash)).size;
  const bucket = key => qrScans.reduce((acc, scan) => {
    const value = scan[key] || "Unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const byDay = qrScans.reduce((acc, scan) => {
    const day = scan.time.slice(0, 10);
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  return {
    totalScans: qrScans.length,
    uniqueVisitors,
    lastScanAt: qrScans[0]?.time || null,
    byDay,
    devices: bucket("device"),
    browsers: bucket("browser"),
    os: bucket("os"),
    referrers: bucket("referrerLabel"),
    recentScans: qrScans.slice(0, 25)
  };
}

function buildPayload(qr) {
  if (qr.dynamic) return qr.shortUrl || qr.destination;
  return qr.payload || qr.destination;
}

async function routeApi(req, res, pathname) {
  const store = loadStore();

  if (req.method === "GET" && pathname === "/api/qrs") {
    const qrs = store.qrs.map(qr => {
      const enriched = publicQr(qr, req);
      return { ...enriched, payload: buildPayload(enriched), analytics: aggregate(qr, store.scans) };
    });
    return send(res, 200, { qrs });
  }

  if (req.method === "POST" && pathname === "/api/qrs") {
    const input = await readJson(req);
    if (!input.destination && !input.payload) return send(res, 400, { error: "Destination is required." });
    const qr = normalizeQr(input);
    store.qrs.unshift(qr);
    saveStore(store);
    const enriched = publicQr(qr, req);
    return send(res, 201, { qr: { ...enriched, payload: buildPayload(enriched), analytics: aggregate(qr, store.scans) } });
  }

  const match = pathname.match(/^\/api\/qrs\/([^/]+)$/);
  if (match && req.method === "PUT") {
    const id = match[1];
    const index = store.qrs.findIndex(qr => qr.id === id);
    if (index === -1) return send(res, 404, { error: "QR not found." });
    const input = await readJson(req);
    store.qrs[index] = normalizeQr({ ...store.qrs[index], ...input, id, createdAt: store.qrs[index].createdAt });
    saveStore(store);
    const enriched = publicQr(store.qrs[index], req);
    return send(res, 200, { qr: { ...enriched, payload: buildPayload(enriched), analytics: aggregate(store.qrs[index], store.scans) } });
  }

  if (match && req.method === "DELETE") {
    const id = match[1];
    store.qrs = store.qrs.filter(qr => qr.id !== id);
    store.scans = store.scans.filter(scan => scan.qrId !== id);
    saveStore(store);
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "Not found." });
}

function redirect(req, res, id) {
  const store = loadStore();
  const qr = store.qrs.find(item => item.id === id);
  if (!qr) return send(res, 404, "QR code not found.", "text/plain; charset=utf-8");

  const ip = clientIp(req);
  const agent = parseAgent(req.headers["user-agent"] || "");
  const referrer = req.headers.referer || "";
  store.scans.unshift({
    id: crypto.randomBytes(6).toString("hex"),
    qrId: id,
    time: new Date().toISOString(),
    ipHash: crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16),
    referrerLabel: referrer ? safeHostname(referrer) : "Direct",
    userAgent: req.headers["user-agent"] || "Unknown",
    ...agent
  });
  saveStore(store);

  res.writeHead(302, { Location: qr.destination || qr.payload || "/" });
  res.end();
}

function safeHostname(value) {
  try {
    return new URL(value).hostname || "Unknown";
  } catch {
    return "Unknown";
  }
}

function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(filePath, (error, content) => {
    if (error) return send(res, 404, "Not found", "text/plain");
    send(res, 200, content, MIME[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return routeApi(req, res, url.pathname);
    const redirectMatch = url.pathname.match(/^\/r\/([^/]+)$/);
    if (redirectMatch) return redirect(req, res, redirectMatch[1]);
    serveStatic(req, res, url.pathname);
  } catch (error) {
    send(res, 500, { error: error.message || "Server error." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`QR Analytics Studio running at http://localhost:${PORT}`);
});
