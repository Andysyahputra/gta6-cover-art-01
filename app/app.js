// Vice Cover Studio — GTA-style cover art maker.
// All drawing happens on canvas; photos are read locally and never uploaded.
// No network, no libraries, no font files: system fonts only.

const $ = (id) => document.getElementById(id);
const preview = $('preview');
const pctx = preview.getContext('2d');

// ---------------------------------------------------------------- state
const state = {
  layout: 'grid',          // grid | split | solo
  grade: 'sunset',         // sunset | neon | duotone
  title: 'VICE CITY',
  subtitle: 'SUNSET STRIP \u2022 VOL. 01',
  titlePos: 'bottom',      // bottom | top
  titleColor: 'white',     // white | pink | yellow | cyan
  size: '1080x1080',       // export size
  photos: [],              // { img, name } up to 3
  panels: [],              // per panel: { photo: -1 | index, scale, ox, oy }
  selected: 0,             // selected panel index
};

const LAYOUTS = {
  grid: {
    label: 'Sunset Grid',
    panels: [
      { x: 0.0, y: 0.0, w: 0.6, h: 1.0 },
      { x: 0.6, y: 0.0, w: 0.4, h: 0.5 },
      { x: 0.6, y: 0.5, w: 0.4, h: 0.5 },
    ],
    band: 0.18,
  },
  split: {
    label: 'Neon Split',
    panels: [
      { x: 0.0, y: 0.0, w: 0.5, h: 1.0 },
      { x: 0.5, y: 0.0, w: 0.5, h: 1.0 },
    ],
    band: 0.18,
  },
  solo: {
    label: 'Solo Spotlight',
    panels: [
      { x: 0.0, y: 0.0, w: 1.0, h: 1.0 },
    ],
    band: 0.22,
  },
};

const GRADES = {
  sunset: {
    filter: 'saturate(1.35) contrast(1.08) sepia(0.18)',
    overlay: ['#ff9a3d', '#ff2e88'],
    overlayOp: 0.32,
    band: ['#2b0a3d', '#ff7a18', '#ffd23d'],
    sun: '#ffd23d',
  },
  neon: {
    filter: 'saturate(1.55) contrast(1.15) hue-rotate(-8deg)',
    overlay: ['#00e5ff', '#ff2e88'],
    overlayOp: 0.30,
    band: ['#050b2e', '#1b2a6b', '#ff2e88'],
    sun: '#00e5ff',
  },
  duotone: {
    filter: 'grayscale(1) contrast(1.28) brightness(1.06)',
    overlay: ['#ff2e88', '#00e5ff'],
    overlayOp: 0.38,
    band: ['#12041f', '#ff2e88', '#00e5ff'],
    sun: '#ff2e88',
  },
};

const TITLE_COLORS = {
  white: ['#ffffff', '#ffe9a8'],
  pink: ['#ff5ea8', '#ffd23d'],
  yellow: ['#ffd23d', '#ffffff'],
  cyan: ['#5ff2ff', '#ffffff'],
};

function resetPanels() {
  const n = LAYOUTS[state.layout].panels.length;
  const { w: ew, h: eh } = exportDims();
  const layout = LAYOUTS[state.layout];
  const panelAreaH = eh * (1 - layout.band);
  state.panels = [];
  for (let i = 0; i < n; i++) {
    const p = layout.panels[i];
    const photoIdx = state.photos.length ? i % state.photos.length : -1;
    // Bias the crop toward the top of a tall photo in a wide panel, so a
    // face near the top of the portrait stays in frame by default.
    let oy = 0;
    if (photoIdx >= 0) {
      const photo = state.photos[photoIdx];
      const photoAspect = photo.img.naturalWidth / photo.img.naturalHeight;
      const panelAspect = (p.w * ew) / (p.h * panelAreaH);
      if (photoAspect < panelAspect * 0.85) oy = 0.15;
    }
    state.panels.push({ photo: photoIdx, scale: 1, ox: 0, oy });
  }
  state.selected = 0;
  syncPanelStrip();
  syncZoom();
}

// ---------------------------------------------------------------- helpers
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let halftonePattern = null;
function getHalftone(ctx) {
  if (halftonePattern) return halftonePattern;
  const c = document.createElement('canvas');
  c.width = 9; c.height = 9;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.arc(4.5, 4.5, 1.6, 0, Math.PI * 2); g.fill();
  halftonePattern = ctx.createPattern(c, 'repeat');
  return halftonePattern;
}

function fitFont(ctx, text, maxWidth, startPx, family) {
  let px = startPx;
  ctx.font = `900 ${px}px Anton, Impact, "Arial Black", "Segoe UI", sans-serif`;
  while (px > 24 && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = `900 ${px}px Anton, Impact, "Arial Black", "Segoe UI", sans-serif`;
  }
  return px;
}

function wrapTitle(ctx, text, maxWidth, startPx) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], px: startPx };
  let px = startPx;
  let lines = [text];
  for (;;) {
    ctx.font = `900 ${px}px Anton, Impact, "Arial Black", "Segoe UI", sans-serif`;
    if (ctx.measureText(text).width <= maxWidth || px <= 24) { lines = [text]; break; }
    if (words.length >= 2) {
      const mid = Math.ceil(words.length / 2);
      const a = words.slice(0, mid).join(' ');
      const b = words.slice(mid).join(' ');
      if (Math.max(ctx.measureText(a).width, ctx.measureText(b).width) <= maxWidth) {
        lines = [a, b];
        break;
      }
    }
    px -= 4;
  }
  return { lines, px };
}

// ---------------------------------------------------------------- drawing
function drawPhotoPanel(ctx, rect, panel, grade) {
  const { x, y, w, h } = rect;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  const photo = panel.photo >= 0 ? state.photos[panel.photo] : null;
  if (photo) {
    const iw = photo.img.naturalWidth;
    const ih = photo.img.naturalHeight;
    const base = Math.max(w / iw, h / ih) * panel.scale;
    const dw = iw * base;
    const dh = ih * base;
    const dx = x + (w - dw) / 2 + panel.ox * w;
    const dy = y + (h - dh) / 2 + panel.oy * h;
    ctx.filter = grade.filter;
    ctx.drawImage(photo.img, dx, dy, dw, dh);
    ctx.filter = 'none';
    // colour-grade wash
    const wash = ctx.createLinearGradient(x, y, x, y + h);
    wash.addColorStop(0, grade.overlay[0]);
    wash.addColorStop(1, grade.overlay[1]);
    ctx.globalAlpha = grade.overlayOp;
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = wash;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // halftone dots, stronger at the bottom of the panel
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = getHalftone(ctx);
    ctx.fillRect(x, y + h * 0.55, w, h * 0.45);
    ctx.globalAlpha = 1;
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#241b4d');
    g.addColorStop(1, '#120e26');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = `700 ${Math.max(13, w * 0.045)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DROP A PHOTO', x + w / 2, y + h / 2 - 8);
    ctx.font = `400 ${Math.max(11, w * 0.03)}px "Segoe UI", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('or tap Demo photos', x + w / 2, y + h / 2 + 14);
  }

  // panel frame
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = Math.max(3, w * 0.012);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawTitleBand(ctx, W, H, layout, grade) {
  const bandH = H * layout.band;
  const by = state.titlePos === 'top' ? 0 : H - bandH;
  // band background: grade gradient + sun disc
  const g = ctx.createLinearGradient(0, by, 0, by + bandH);
  g.addColorStop(0, grade.band[0]);
  g.addColorStop(0.55, grade.band[1]);
  g.addColorStop(1, grade.band[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, by, W, bandH);
  // sun disc
  const sunR = bandH * 0.52;
  const sunX = W * 0.86;
  const sunY = by + bandH * 0.5;
  const sg = ctx.createRadialGradient(sunX, sunY, sunR * 0.1, sunX, sunY, sunR);
  sg.addColorStop(0, '#fff6c9');
  sg.addColorStop(0.5, grade.sun);
  sg.addColorStop(1, 'rgba(255,120,60,0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();
  // halftone strip along the band edge
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = getHalftone(ctx);
  ctx.fillRect(0, by, W, Math.max(6, bandH * 0.12));
  ctx.globalAlpha = 1;
  // thin divider line
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, state.titlePos === 'top' ? bandH - 3 : H - bandH, W, 3);
  return { by, bandH };
}

function drawTitle(ctx, W, H, band) {
  const { by, bandH } = band;
  const title = (state.title || 'VICE CITY').toUpperCase();
  const sub = (state.subtitle || '').toUpperCase();
  const cx = W / 2;
  const cy = by + bandH / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.035); // slight poster tilt
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const maxW = W * 0.86;
  const startPx = Math.round(bandH * (sub ? 0.42 : 0.58));
  const { lines, px } = wrapTitle(ctx, title, maxW, startPx);
  const lineH = px * 0.98;
  const totalH = lines.length * lineH;
  const titleY = sub ? -bandH * 0.10 : 0;
  const [c1, c2] = TITLE_COLORS[state.titleColor] || TITLE_COLORS.white;

  ctx.font = `900 ${px}px Anton, Impact, "Arial Black", "Segoe UI", sans-serif`;
  lines.forEach((line, i) => {
    const y = titleY - totalH / 2 + lineH * (i + 0.5);
    // drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(line, 4, y + 5);
    // outline
    ctx.lineWidth = Math.max(4, px * 0.13);
    ctx.strokeStyle = '#12041f';
    ctx.strokeText(line, 0, y);
    // fill
    const fg = ctx.createLinearGradient(0, y - px / 2, 0, y + px / 2);
    fg.addColorStop(0, c1);
    fg.addColorStop(1, c2);
    ctx.fillStyle = fg;
    ctx.fillText(line, 0, y);
  });

  if (sub) {
    try { ctx.letterSpacing = '3px'; } catch (e) { /* older engines ignore */ }
    const subPx = Math.max(13, Math.round(bandH * 0.17));
    ctx.font = `800 ${subPx}px "Segoe UI", Arial, sans-serif`;
    const tw = ctx.measureText(sub).width + 28;
    const pillY = titleY + totalH / 2 + subPx * 0.9;
    ctx.fillStyle = 'rgba(10,4,24,0.78)';
    roundRect(ctx, -tw / 2, pillY - subPx * 0.75, tw, subPx * 1.5, subPx * 0.75);
    ctx.fill();
    ctx.fillStyle = '#ffd23d';
    ctx.fillText(sub, 0, pillY + 1);
    try { ctx.letterSpacing = '0px'; } catch (e) { /* ignore */ }
  }
  ctx.restore();
}

function renderPoster(ctx, W, H) {
  const layout = LAYOUTS[state.layout];
  const grade = GRADES[state.grade];
  // backdrop
  ctx.fillStyle = '#0a0618';
  ctx.fillRect(0, 0, W, H);
  const bandH = H * layout.band;
  const panelAreaH = H - bandH;
  const yOff = state.titlePos === 'top' ? bandH : 0;
  // panels
  layout.panels.forEach((p, i) => {
    const rect = {
      x: p.x * W,
      y: yOff + p.y * panelAreaH,
      w: p.w * W,
      h: p.h * panelAreaH,
    };
    drawPhotoPanel(ctx, rect, state.panels[i] || { photo: -1, scale: 1, ox: 0, oy: 0 }, grade);
  });
  // title band + lettering
  const band = drawTitleBand(ctx, W, H, layout, grade);
  drawTitle(ctx, W, H, band);
  // outer frame
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(4, W * 0.008);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
}

// ---------------------------------------------------------------- preview
function exportDims() {
  const [w, h] = state.size.split('x').map(Number);
  return { w, h };
}

function renderPreview() {
  const { w, h } = exportDims();
  const pw = preview.width;
  const ph = preview.height;
  pctx.fillStyle = '#05040a';
  pctx.fillRect(0, 0, pw, ph);
  const scale = Math.min(pw / w, ph / h);
  const dw = w * scale;
  const dh = h * scale;
  const dx = (pw - dw) / 2;
  const dy = (ph - dh) / 2;
  pctx.save();
  pctx.translate(dx, dy);
  pctx.scale(scale, scale);
  renderPoster(pctx, w, h);
  pctx.restore();
  // store the fit rect for pointer mapping
  preview._fit = { dx, dy, scale, w, h };
  const hint = $('emptyHint');
  hint.style.display = state.photos.length ? 'none' : 'block';
}

function renderExport() {
  const { w, h } = exportDims();
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  renderPoster(c.getContext('2d'), w, h);
  return c;
}

// ---------------------------------------------------------------- photos
function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function loadFiles(files) {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 3);
  for (const file of list) {
    try {
      const img = await fileToImage(file);
      if (state.photos.length >= 3) state.photos.shift();
      state.photos.push({ img, name: file.name });
    } catch (e) { /* skip unreadable file */ }
  }
  resetPanels();
  syncPhotoSlots();
  renderPreview();
  setStatus(list.length ? `${list.length} photo${list.length > 1 ? 's' : ''} loaded.` : 'No image files found.');
}

async function loadDemoPhotos() {
  setStatus('Loading demo photos\u2026');
  const urls = ['samples/demo-sunset.jpg', 'samples/demo-neon.jpg'];
  state.photos = [];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = URL.createObjectURL(blob);
      });
      state.photos.push({ img, name: url.split('/').pop() });
    } catch (e) { /* keep going with what loaded */ }
  }
  resetPanels();
  syncPhotoSlots();
  renderPreview();
  setStatus(state.photos.length ? 'Demo photos loaded — drag a panel photo to reposition it.' : 'Demo photos failed to load.');
}

// ---------------------------------------------------------------- UI sync
function syncPhotoSlots() {
  const wrap = $('photoSlots');
  wrap.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot';
    const p = state.photos[i];
    if (p) {
      b.style.backgroundImage = `url(${p.img.src})`;
      b.innerHTML = `<span>${p.name.length > 14 ? p.name.slice(0, 13) + '\u2026' : p.name}</span>`;
    } else {
      b.innerHTML = '<span>empty</span>';
    }
    b.addEventListener('click', () => {
      if (!state.photos[i]) return;
      const panel = state.panels[state.selected];
      if (panel) {
        panel.photo = i;
        renderPreview();
        setStatus(`Panel ${state.selected + 1} now shows photo ${i + 1}.`);
      }
    });
    wrap.appendChild(b);
  }
}

function syncPanelStrip() {
  const strip = $('panelStrip');
  strip.innerHTML = '';
  const n = LAYOUTS[state.layout].panels.length;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    const hasPhoto = state.panels[i] && state.panels[i].photo >= 0;
    b.className = 'panel-chip' + (i === state.selected ? ' active' : '') + (hasPhoto ? '' : ' empty');
    b.innerHTML = `<span class="dot"></span>Panel ${i + 1}${hasPhoto ? ' \u2022 photo ' + (state.panels[i].photo + 1) : ' \u2022 empty'}`;
    b.addEventListener('click', () => {
      state.selected = i;
      syncPanelStrip();
      syncZoom();
    });
    strip.appendChild(b);
  }
}

function syncZoom() {
  const panel = state.panels[state.selected];
  $('zoomSlider').value = panel ? Math.round(panel.scale * 100) : 100;
}

function setStatus(text) {
  $('statusLine').textContent = text;
}

// ---------------------------------------------------------------- pointer
let drag = null;

function canvasPos(evt) {
  const r = preview.getBoundingClientRect();
  const x = (evt.clientX - r.left) * (preview.width / r.width);
  const y = (evt.clientY - r.top) * (preview.height / r.height);
  return { x, y };
}

function hitPanel(x, y) {
  const fit = preview._fit;
  if (!fit) return -1;
  const px = (x - fit.dx) / fit.scale;
  const py = (y - fit.dy) / fit.scale;
  if (px < 0 || py < 0 || px > fit.w || py > fit.h) return -1;
  const layout = LAYOUTS[state.layout];
  const bandH = fit.h * layout.band;
  const panelAreaH = fit.h - bandH;
  const yOff = state.titlePos === 'top' ? bandH : 0;
  for (let i = layout.panels.length - 1; i >= 0; i--) {
    const p = layout.panels[i];
    const rx = p.x * fit.w;
    const ry = yOff + p.y * panelAreaH;
    const rw = p.w * fit.w;
    const rh = p.h * panelAreaH;
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return i;
  }
  return -1;
}

preview.addEventListener('pointerdown', (evt) => {
  const { x, y } = canvasPos(evt);
  const idx = hitPanel(x, y);
  if (idx < 0) return;
  state.selected = idx;
  syncPanelStrip();
  syncZoom();
  const panel = state.panels[idx];
  drag = { idx, startX: x, startY: y, ox: panel.ox, oy: panel.oy, moved: false };
  preview.setPointerCapture(evt.pointerId);
});

preview.addEventListener('pointermove', (evt) => {
  if (!drag) return;
  const { x, y } = canvasPos(evt);
  const fit = preview._fit;
  const layout = LAYOUTS[state.layout];
  const p = layout.panels[drag.idx];
  const panel = state.panels[drag.idx];
  const pw = p.w * fit.w;
  const ph = p.h * (fit.h - fit.h * layout.band);
  const dxp = (x - drag.startX) / fit.scale;
  const dyp = (y - drag.startY) / fit.scale;
  panel.ox = Math.max(-0.6, Math.min(0.6, drag.ox + dxp / pw));
  panel.oy = Math.max(-0.6, Math.min(0.6, drag.oy + dyp / ph));
  if (Math.abs(dxp) + Math.abs(dyp) > 2) drag.moved = true;
  renderPreview();
});

preview.addEventListener('pointerup', () => {
  drag = null;
});

preview.addEventListener('wheel', (evt) => {
  const { x, y } = canvasPos(evt);
  const idx = hitPanel(x, y);
  if (idx < 0) return;
  evt.preventDefault();
  const panel = state.panels[idx];
  const factor = evt.deltaY < 0 ? 1.08 : 0.93;
  panel.scale = Math.max(1, Math.min(2.6, panel.scale * factor));
  state.selected = idx;
  syncPanelStrip();
  syncZoom();
  renderPreview();
}, { passive: false });

// ---------------------------------------------------------------- controls
$('fileInput').addEventListener('change', (evt) => {
  loadFiles(evt.target.files);
  evt.target.value = '';
});

$('demoBtn').addEventListener('click', loadDemoPhotos);

$('layoutRow').addEventListener('click', (evt) => {
  const btn = evt.target.closest('[data-layout]');
  if (!btn) return;
  state.layout = btn.dataset.layout;
  document.querySelectorAll('#layoutRow .choice').forEach((c) => c.classList.toggle('active', c === btn));
  resetPanels();
  renderPreview();
  setStatus(`Layout: ${LAYOUTS[state.layout].label}.`);
});

$('gradeRow').addEventListener('click', (evt) => {
  const btn = evt.target.closest('[data-grade]');
  if (!btn) return;
  state.grade = btn.dataset.grade;
  document.querySelectorAll('#gradeRow .choice').forEach((c) => c.classList.toggle('active', c === btn));
  renderPreview();
});

$('titleInput').addEventListener('input', (evt) => { state.title = evt.target.value; renderPreview(); });
$('subtitleInput').addEventListener('input', (evt) => { state.subtitle = evt.target.value; renderPreview(); });
$('titlePos').addEventListener('change', (evt) => { state.titlePos = evt.target.value; renderPreview(); });
$('titleColor').addEventListener('change', (evt) => { state.titleColor = evt.target.value; renderPreview(); });

$('zoomSlider').addEventListener('input', (evt) => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.scale = Number(evt.target.value) / 100;
  renderPreview();
});

$('fitBtn').addEventListener('click', () => {
  const panel = state.panels[state.selected];
  if (!panel) return;
  panel.scale = 1;
  panel.ox = 0;
  panel.oy = 0;
  syncZoom();
  renderPreview();
  setStatus(`Panel ${state.selected + 1} fitted.`);
});

$('swapBtn').addEventListener('click', () => {
  if (state.panels.length < 2) return;
  const a = state.panels[0];
  const b = state.panels[1];
  const tmp = a.photo;
  a.photo = b.photo;
  b.photo = tmp;
  renderPreview();
  setStatus('Panels 1 and 2 swapped.');
});

$('sizeRow').addEventListener('click', (evt) => {
  const btn = evt.target.closest('[data-size]');
  if (!btn) return;
  state.size = btn.dataset.size;
  document.querySelectorAll('#sizeRow .choice').forEach((c) => c.classList.toggle('active', c === btn));
  renderPreview();
  setStatus(`Export size: ${state.size.replace('x', ' \u00d7 ')}.`);
});

$('exportBtn').addEventListener('click', () => {
  setStatus('Rendering PNG\u2026');
  try {
    const canvas = renderExport();
    canvas.toBlob((blob) => {
      if (!blob) { setStatus('Export failed — try again.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vice-cover-${state.size}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(`Exported vice-cover-${state.size}.png (${(blob.size / 1024).toFixed(0)} KB). Share it!`);
    }, 'image/png');
  } catch (e) {
    setStatus('Export failed — try again.');
  }
});

// ---------------------------------------------------------------- boot
resetPanels();
syncPhotoSlots();
renderPreview();

// Automation hook for screenshots: drive the app and grab an export.
window.__vice = {
  state,
  loadDemoPhotos,
  renderPreview,
  exportDataURL() {
    const canvas = renderExport();
    return canvas.toDataURL('image/png');
  },
  setCaption(title, subtitle) {
    state.title = title;
    state.subtitle = subtitle;
    $('titleInput').value = title;
    $('subtitleInput').value = subtitle;
    renderPreview();
  },
};
