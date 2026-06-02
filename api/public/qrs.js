const { loadStore, saveStore, send, sendError, readBody, normalizeQr, withAnalytics } = require("../_lib/store");

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return send(res, 405, { error: "Method not allowed." });
    }

    const input = await readBody(req);
    if (!input.destination && !input.payload) return send(res, 400, { error: "Destination is required." });

    const store = await loadStore();
    const qr = normalizeQr({ ...input, dynamic: true });
    store.qrs.unshift(qr);
    await saveStore(store);

    const created = withAnalytics(qr, req, store.scans);
    return send(res, 201, {
      qr: {
        id: created.id,
        name: created.name,
        type: created.type,
        destination: created.destination,
        payload: created.payload,
        shortUrl: created.shortUrl,
        style: created.style,
        createdAt: created.createdAt
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
};
