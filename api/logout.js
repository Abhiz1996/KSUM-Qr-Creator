const { clearSessionCookie } = require("./_lib/auth");
const { send } = require("./_lib/store");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed." });
  }

  clearSessionCookie(req, res);
  return send(res, 200, { ok: true });
};
