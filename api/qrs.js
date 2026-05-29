const { loadStore, saveStore, send, sendError, parseBody, normalizeQr, withAnalytics } = require("./_lib/store");

module.exports = async function handler(req, res) {
  try {
    const store = await loadStore();

    if (req.method === "GET") {
      return send(res, 200, { qrs: store.qrs.map(qr => withAnalytics(qr, req, store.scans)) });
    }

    if (req.method === "POST") {
      const input = parseBody(req);
      if (!input.destination && !input.payload) return send(res, 400, { error: "Destination is required." });
      const qr = normalizeQr(input);
      store.qrs.unshift(qr);
      await saveStore(store);
      return send(res, 201, { qr: withAnalytics(qr, req, store.scans) });
    }

    res.setHeader("Allow", "GET, POST");
    return send(res, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendError(res, error);
  }
};
