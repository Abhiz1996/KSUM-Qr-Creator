const { passwordMatches, setSessionCookie } = require("./_lib/auth");
const { readBody, send } = require("./_lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  if (!process.env.ADMIN_PASSWORD) return send(res, 503, { error: "Admin password is not configured." });
  const input = await readBody(req);
  if (!passwordMatches(input.password)) return send(res, 401, { error: "Invalid password." });
  setSessionCookie(req, res);
  return send(res, 200, { ok: true });
};
