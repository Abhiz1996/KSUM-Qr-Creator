const state = {
  savedQr: null,
  renderedCanvas: null
};

const $ = selector => document.querySelector(selector);

const els = {
  form: $("#publicQrForm"),
  name: $("#name"),
  type: $("#type"),
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
  formStatus: $("#formStatus"),
  copyLink: $("#copyLink")
};

function currentForm() {
  const destination = normalizeDestination(els.type.value, els.destination.value.trim());
  return {
    name: els.name.value.trim(),
    type: els.type.value,
    destination,
    payload: destination,
    dynamic: true,
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

function renderQr(qr) {
  const payload = qr.shortUrl || qr.destination || qr.payload;
  els.preview.innerHTML = "";
  if (!payload) {
    els.preview.innerHTML = `<p class="short-url">Enter data to preview the QR.</p>`;
    state.renderedCanvas = null;
    els.shortUrl.textContent = "";
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
  els.shortUrl.textContent = qr.shortUrl ? qr.shortUrl : "Preview only. Create the QR to get a tracked link.";
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

async function saveQr(event) {
  event.preventDefault();
  const qr = currentForm();
  if (!qr.destination) return;

  els.formStatus.textContent = "Creating QR...";
  try {
    const response = await fetch("/api/public/qrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(qr)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not create QR.");
    state.savedQr = data.qr;
    renderQr(data.qr);
    els.formStatus.textContent = "QR created. This scan link is now tracked in the admin backend.";
  } catch (error) {
    els.formStatus.textContent = error.message || "Could not create QR.";
  }
}

function resetQr() {
  state.savedQr = null;
  els.form.reset();
  els.foreground.value = "#111827";
  els.background.value = "#ffffff";
  els.accent.value = "#2dd4bf";
  els.size.value = "280";
  els.errorCorrection.value = "M";
  els.formStatus.textContent = "";
  renderQr(currentForm());
}

async function copyLink() {
  const link = state.savedQr?.shortUrl;
  if (!link) return;
  try {
    await navigator.clipboard.writeText(link);
    els.formStatus.textContent = "Tracked link copied.";
  } catch {
    els.formStatus.textContent = link;
  }
}

function downloadPng() {
  if (!state.renderedCanvas) return;
  const link = document.createElement("a");
  link.download = `${state.savedQr?.name || els.name.value || "qr-code"}.png`;
  link.href = state.renderedCanvas.toDataURL("image/png");
  link.click();
}

function downloadSvg() {
  const qr = state.savedQr || currentForm();
  const payload = qr.shortUrl || qr.destination || qr.payload;
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
$("#resetQr").addEventListener("click", resetQr);
$("#downloadPng").addEventListener("click", downloadPng);
$("#downloadSvg").addEventListener("click", downloadSvg);
els.copyLink.addEventListener("click", copyLink);
["input", "change"].forEach(eventName => els.form.addEventListener(eventName, () => {
  if (!state.savedQr) renderQr(currentForm());
}));

renderQr(currentForm());
