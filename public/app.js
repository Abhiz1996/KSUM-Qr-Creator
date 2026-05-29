const state = {
  qrs: [],
  selectedId: null,
  renderedCanvas: null
};

const $ = selector => document.querySelector(selector);

const els = {
  list: $("#qrList"),
  form: $("#qrForm"),
  name: $("#name"),
  type: $("#type"),
  dynamic: $("#dynamic"),
  destination: $("#destination"),
  foreground: $("#foreground"),
  background: $("#background"),
  accent: $("#accent"),
  frame: $("#frame"),
  logoText: $("#logoText"),
  size: $("#size"),
  errorCorrection: $("#errorCorrection"),
  preview: $("#qrPreview"),
  shortUrl: $("#shortUrl"),
  analyticsTabs: $("#analyticsTabs"),
  analyticsTitle: $("#analyticsTitle"),
  totalScans: $("#totalScans"),
  uniqueVisitors: $("#uniqueVisitors"),
  lastScan: $("#lastScan"),
  scanChart: $("#scanChart"),
  recentScans: $("#recentScans")
};

function currentForm() {
  const destination = normalizeDestination(els.type.value, els.destination.value.trim());
  return {
    id: state.selectedId,
    name: els.name.value.trim(),
    type: els.type.value,
    destination,
    payload: destination,
    dynamic: els.dynamic.checked,
    style: {
      foreground: els.foreground.value,
      background: els.background.value,
      accent: els.accent.value,
      frame: els.frame.value,
      logoText: els.logoText.value,
      size: Number(els.size.value),
      margin: 4,
      errorCorrection: els.errorCorrection.value
    }
  };
}

function normalizeDestination(type, value) {
  if (!value) return "";
  if (type === "url" && !/^https?:\/\//i.test(value)) return `https://${value}`;
  if (type === "email" && !value.startsWith("mailto:")) return `mailto:${value}`;
  if (type === "sms" && !value.startsWith("sms:")) return `sms:${value}`;
  if (type === "whatsapp" && !value.startsWith("https://wa.me/")) return `https://wa.me/${value.replace(/[^\d]/g, "")}`;
  if (type === "wifi" && !value.startsWith("WIFI:")) return `WIFI:T:WPA;S:${value};P:password;;`;
  if (type === "vcard" && !value.startsWith("BEGIN:VCARD")) return `BEGIN:VCARD\nVERSION:3.0\nFN:${value}\nEND:VCARD`;
  return value;
}

function fillForm(qr) {
  els.name.value = qr?.name || "";
  els.type.value = qr?.type || "url";
  els.dynamic.checked = qr?.dynamic !== false;
  els.destination.value = qr?.destination || "";
  els.foreground.value = qr?.style?.foreground || "#111827";
  els.background.value = qr?.style?.background || "#ffffff";
  els.accent.value = qr?.style?.accent || "#2dd4bf";
  els.frame.value = qr?.style?.frame || "none";
  els.logoText.value = qr?.style?.logoText || "";
  els.size.value = qr?.style?.size || 280;
  els.errorCorrection.value = qr?.style?.errorCorrection || "M";
}

function selectedQr() {
  return state.qrs.find(qr => qr.id === state.selectedId);
}

async function loadQrs() {
  const response = await fetch("/api/qrs");
  const data = await response.json();
  state.qrs = data.qrs;
  if (!state.selectedId && state.qrs[0]) state.selectedId = state.qrs[0].id;
  renderAll();
}

function renderAll() {
  renderList();
  renderAnalyticsTabs();
  const qr = selectedQr();
  if (qr) fillForm(qr);
  renderQr(qr || currentForm());
  renderAnalytics(qr);
}

function renderList() {
  els.list.innerHTML = state.qrs.length ? "" : `<p class="short-url">No QR codes yet.</p>`;
  state.qrs.forEach(qr => {
    const button = document.createElement("button");
    button.className = `qr-item ${qr.id === state.selectedId ? "active" : ""}`;
    button.innerHTML = `<strong>${escapeHtml(qr.name)}</strong><span>${qr.analytics.totalScans} scans · ${qr.type}</span>`;
    button.addEventListener("click", () => {
      state.selectedId = qr.id;
      renderAll();
    });
    els.list.appendChild(button);
  });
}

function renderAnalyticsTabs() {
  if (!state.qrs.length) {
    els.analyticsTabs.innerHTML = `<span class="empty-tabs">Save a QR code to see analytics tabs.</span>`;
    return;
  }

  els.analyticsTabs.innerHTML = "";
  state.qrs.forEach(qr => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `analytics-tab ${qr.id === state.selectedId ? "active" : ""}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(qr.id === state.selectedId));
    tab.innerHTML = `<span>${escapeHtml(qr.name)}</span><strong>${qr.analytics.totalScans}</strong>`;
    tab.addEventListener("click", () => {
      state.selectedId = qr.id;
      renderAll();
    });
    els.analyticsTabs.appendChild(tab);
  });
}

function renderQr(qr) {
  if (!qr) return;
  const payload = qr.dynamic ? qr.shortUrl || qr.destination : qr.payload || qr.destination;
  els.preview.innerHTML = "";
  if (!payload) {
    els.preview.innerHTML = `<p class="short-url">Enter data to preview the QR.</p>`;
    return;
  }

  const frame = document.createElement("div");
  frame.className = `qr-frame ${qr.style.frame}`;
  frame.style.setProperty("--accent", qr.style.accent);
  frame.style.setProperty("--fg", qr.style.foreground);
  frame.style.setProperty("--bg", qr.style.background);

  const canvas = document.createElement("canvas");
  const size = Number(qr.style.size || 280);
  canvas.width = size;
  canvas.height = size;
  drawQr(canvas, payload, qr.style);
  frame.appendChild(canvas);

  if (qr.style.logoText) {
    const context = canvas.getContext("2d");
    const box = Math.max(42, size * 0.18);
    context.fillStyle = qr.style.background;
    context.fillRect((size - box) / 2, (size - box) / 2, box, box);
    context.fillStyle = qr.style.accent;
    context.beginPath();
    context.roundRect((size - box) / 2 + 4, (size - box) / 2 + 4, box - 8, box - 8, 8);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `800 ${Math.floor(box * 0.36)}px system-ui`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(qr.style.logoText, size / 2, size / 2 + 1);
  }

  if (qr.style.frame !== "none") {
    const label = document.createElement("div");
    label.className = "frame-label";
    label.textContent = qr.style.frame === "scan" ? "Scan me" : qr.name || "QR Code";
    frame.appendChild(label);
  }

  state.renderedCanvas = canvas;
  els.preview.appendChild(frame);
  els.shortUrl.textContent = qr.dynamic && qr.shortUrl ? qr.shortUrl : "Static QR: analytics are unavailable unless scan tracking is enabled.";
}

function drawQr(canvas, payload, style) {
  const qr = qrcode(0, style.errorCorrection || "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const margin = Number(style.margin || 4);
  const cell = size / (count + margin * 2);
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = style.foreground;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(Math.round((col + margin) * cell), Math.round((row + margin) * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

function renderAnalytics(qr) {
  const analytics = qr?.analytics;
  els.analyticsTitle.textContent = qr ? `${qr.name} · ${qr.type}` : "No QR selected";
  els.totalScans.textContent = analytics?.totalScans || 0;
  els.uniqueVisitors.textContent = analytics?.uniqueVisitors || 0;
  els.lastScan.textContent = analytics?.lastScanAt ? new Date(analytics.lastScanAt).toLocaleString() : "Never";
  renderChart(analytics?.byDay || {});
  els.recentScans.innerHTML = (analytics?.recentScans || []).map(scan => `
    <tr>
      <td>${new Date(scan.time).toLocaleString()}</td>
      <td>${escapeHtml(scan.device)}</td>
      <td>${escapeHtml(scan.browser)}</td>
      <td>${escapeHtml(scan.os)}</td>
    </tr>
  `).join("") || `<tr><td colspan="4">No scans recorded yet.</td></tr>`;
}

function renderChart(byDay) {
  const entries = Object.entries(byDay).slice(-14);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  els.scanChart.innerHTML = entries.length ? "" : `<p class="short-url">Scans will appear here by day.</p>`;
  entries.forEach(([day, value]) => {
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(8, (value / max) * 100)}%`;
    bar.title = `${day}: ${value} scans`;
    bar.innerHTML = `<span>${value}</span>`;
    els.scanChart.appendChild(bar);
  });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
}

async function saveQr(event) {
  event.preventDefault();
  const qr = currentForm();
  const method = state.selectedId ? "PUT" : "POST";
  const url = state.selectedId ? `/api/qrs/${state.selectedId}` : "/api/qrs";
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(qr)
  });
  const data = await response.json();
  state.selectedId = data.qr.id;
  await loadQrs();
}

async function deleteQr() {
  if (!state.selectedId) return;
  await fetch(`/api/qrs/${state.selectedId}`, { method: "DELETE" });
  state.selectedId = null;
  fillForm(null);
  await loadQrs();
}

function downloadPng() {
  if (!state.renderedCanvas) return;
  const link = document.createElement("a");
  link.download = `${selectedQr()?.name || "qr-code"}.png`;
  link.href = state.renderedCanvas.toDataURL("image/png");
  link.click();
}

function downloadSvg() {
  const qr = selectedQr() || currentForm();
  const payload = qr.dynamic ? qr.shortUrl || qr.destination : qr.payload || qr.destination;
  if (!payload) return;
  const svg = buildSvg(payload, qr.style);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.download = `${qr.name || "qr-code"}.svg`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildSvg(payload, style) {
  const qr = qrcode(0, style.errorCorrection || "M");
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const margin = Number(style.margin || 4);
  const size = count + margin * 2;
  let paths = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) paths += `M${col + margin},${row + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="${style.background}"/><path d="${paths}" fill="${style.foreground}"/></svg>`;
}

els.form.addEventListener("submit", saveQr);
$("#deleteQr").addEventListener("click", deleteQr);
$("#newQr").addEventListener("click", () => {
  state.selectedId = null;
  fillForm(null);
  renderAll();
});
$("#refresh").addEventListener("click", loadQrs);
$("#downloadPng").addEventListener("click", downloadPng);
$("#downloadSvg").addEventListener("click", downloadSvg);
["input", "change"].forEach(eventName => els.form.addEventListener(eventName, () => renderQr(currentForm())));

loadQrs();
