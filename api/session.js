const { isAuthenticated } = require("./_lib/auth");
const { send } = require("./_lib/store");

module.exports = async function handler(req, res) {
  return send(res, 200, {
    authenticated: isAuthenticated(req),
    configured: Boolean(process.env.ADMIN_PASSWORD)
  });
};
