const { loadStore, saveStore, send, sendError, scanRecord } = require("../_lib/store");

module.exports = async function handler(req, res) {
  try {
    const { id } = req.query;
    const store = await loadStore();
    const qr = store.qrs.find(item => item.id === id);
    if (!qr) return send(res, 404, { error: "QR not found." });

    store.scans.unshift(scanRecord(req, id));
    await saveStore(store);

    res.statusCode = 302;
    res.setHeader("Location", qr.destination || qr.payload || "/");
    res.end();
  } catch (error) {
    return sendError(res, error);
  }
};
