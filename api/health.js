const { loadStore, saveStore, send, sendError } = require("./_lib/store");
const { requireAdmin } = require("./_lib/auth");

module.exports = async function handler(req, res) {
  try {
    if (!requireAdmin(req, res, send)) return;
    const store = await loadStore();
    await saveStore(store);
    return send(res, 200, {
      ok: true,
      storage: "redis",
      qrs: store.qrs.length,
      scans: store.scans.length
    });
  } catch (error) {
    return sendError(res, error);
  }
};
