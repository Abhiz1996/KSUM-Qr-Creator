const crypto = require("crypto");

const COOKIE_NAME = "ksum_admin";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function authSecret() {
  return process.env.ADMIN_SECRET || adminPassword();
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function parseCookies(req) {
  return String(req.headers.cookie || "").split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function createSession() {
  const payload = JSON.stringify({ exp: Date.now() + SESSION_MS });
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

function verifySession(token) {
  if (!adminPassword() || !authSecret() || !token) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return false;
  const expected = sign(encoded);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function isAuthenticated(req) {
  return verifySession(parseCookies(req)[COOKIE_NAME]);
}

function cookieOptions(req) {
  const secure = req.headers["x-forwarded-proto"] === "https" || Boolean(process.env.VERCEL);
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure ? "; Secure" : ""}`;
}

function setSessionCookie(req, res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(createSession())}; ${cookieOptions(req)}`);
}

function clearSessionCookie(req, res) {
  const secure = req.headers["x-forwarded-proto"] === "https" || Boolean(process.env.VERCEL);
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`);
}

function requireAdmin(req, res, send) {
  if (isAuthenticated(req)) return true;
  send(res, 401, { error: "Authentication required." });
  return false;
}

function passwordMatches(value) {
  const password = adminPassword();
  if (!password) return false;
  const provided = Buffer.from(String(value || ""));
  const expected = Buffer.from(password);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

module.exports = {
  clearSessionCookie,
  isAuthenticated,
  passwordMatches,
  requireAdmin,
  setSessionCookie
};
