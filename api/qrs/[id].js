const { loadStore, saveStore, send, sendError, readBody, normalizeQr, withAnalytics } = require("../_lib/store");

module.exports = async function handler(req, res) {
  try {
    const { id } = req.query;
    const store = await loadStore();
    const index = store.qrs.findIndex(qr => qr.id === id);
    if (index === -1) return send(res, 404, { error: "QR not found." });

    if (req.method === "PUT") {
      store.qrs[index] = normalizeQr({
        ...store.qrs[index],
        ...await readBody(req),
        id,
        createdAt: store.qrs[index].createdAt
      });
      await saveStore(store);
      return send(res, 200, { qr: withAnalytics(store.qrs[index], req, store.scans) });
    }

    if (req.method === "DELETE") {
      store.qrs = store.qrs.filter(qr => qr.id !== id);
      store.scans = store.scans.filter(scan => scan.qrId !== id);
      await saveStore(store);
      return send(res, 200, { ok: true });
    }

    res.setHeader("Allow", "PUT, DELETE");
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendError(res, error);
  }
};
