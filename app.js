// app.js

// ---------- color helpers ----------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > .5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function getAccentColorFromImage(imgEl) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true });

  const target = 120;
  const ratio = Math.min(target / imgEl.naturalWidth, target / imgEl.naturalHeight, 1);
  c.width  = Math.max(1, Math.round(imgEl.naturalWidth  * ratio));
  c.height = Math.max(1, Math.round(imgEl.naturalHeight * ratio));
  ctx.drawImage(imgEl, 0, 0, c.width, c.height);

  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  const bins = 36;
  const accum = Array.from({ length: bins }, () => ({ r:0, g:0, b:0, w:0 }));

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a < 200) continue;
    const [h, s, l] = rgbToHsl(r, g, b);
    if (l < 0.15 || l > 0.85) continue;
    const w = (s*s) * (1 - Math.abs(l - 0.5) * 1.6);
    if (w <= 0) continue;
    const bin = Math.floor(h * bins) % bins;
    accum[bin].r += r * w;
    accum[bin].g += g * w;
    accum[bin].b += b * w;
    accum[bin].w += w;
  }

  let best = accum[0];
  for (let i = 1; i < bins; i++) if (accum[i].w > best.w) best = accum[i];
  if (best.w === 0) return 'rgb(200,200,200)';
  const r = Math.round(best.r / best.w);
  const g = Math.round(best.g / best.w);
  const b = Math.round(best.b / best.w);
  return `rgb(${r}, ${g}, ${b})`;
}

function setAccent(cssColor) {
  document.documentElement.style.setProperty('--accent-color', cssColor);
  const [r,g,b] = cssColor.match(/\d+/g).map(Number);
  const lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255;
  document.documentElement.style.setProperty('--on-accent', lum > 0.55 ? 'rgba(0,0,0,.85)' : '#fff');
}

// ---------- preview selection & recompute ----------
function getActivePreviewImg() {
  const wrap = document.getElementById('preview');
  if (!wrap) return null;
  return wrap.querySelector('.preview-front')
      || wrap.querySelector('img:last-of-type')
      || wrap.querySelector('img');
}

function recomputeAccent() {
  const img = getActivePreviewImg();
  if (!img) return;
  img.crossOrigin = 'anonymous';
  if (img.complete && img.naturalWidth) {
    try {
      setAccent(getAccentColorFromImage(img));
    } catch (e) {
      console.warn('Accent color: canvas read failed (CORS?)', e);
    }
  } else {
    img.addEventListener('load', recomputeAccent, { once: true });
  }
}

// --- dropdown: click/touch + escape support ---
function setupDropdown() {
  const wrapper = document.querySelector('.dropdown');
  const trigger = document.getElementById('dropdown');
  const submenu = wrapper ? wrapper.querySelector('.submenu') : null;
  if (!wrapper || !trigger || !submenu) return;

  const open = () => {
    wrapper.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    wrapper.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.contains('open') ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

// --- chat panel (upward history) — draggable slider ---
function setupChatPanel() {
  const shell    = document.querySelector('.chat-shell');
  if (!shell) return;

  const handle   = shell.querySelector('.chat-handle');
  const backdrop = shell.querySelector('.chat-backdrop');
  if (!handle || !backdrop) return;

  // read CSS vars
  const css  = getComputedStyle(document.documentElement);
  const minH = parseFloat(css.getPropertyValue('--chat-min-h')) || 0;
  const maxH = parseFloat(css.getPropertyValue('--chat-max-h')) || 220;
  const step = 10;

  // --- state
  let startY = 0;
  let startH = minH;
  let dragging = false;
  let dragMoved = false;
  let suppressClick = false;

  // --- helpers
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const setHeight = (h, announce = true) => {
    const clamped = clamp(h, minH, maxH);
    backdrop.style.height = clamped + 'px'; // keep result
    shell.style.setProperty('--chat-h', clamped + 'px'); // move handle with top
    shell.classList.toggle('expanded', clamped > minH + 1); // only for overflow
    const pct = Math.round(((clamped - minH) / (maxH - minH)) * 100);
    handle.setAttribute('aria-valuenow', String(pct));
    if (announce) handle.setAttribute('aria-expanded', String(clamped > minH));
  };

  // seed height and handle position
  setHeight(minH);

  // --- dragging
  const beginDrag = (clientY) => {
    dragging = true;
    dragMoved = false;
    shell.classList.add('dragging');
    startY = clientY;
    startH = backdrop.getBoundingClientRect().height;
    document.body.style.userSelect = 'none';
  };

  const moveDrag = (clientY) => {
    if (!dragging) return;
    const dy = startY - clientY; // drag up => taller
    if (Math.abs(dy) > 2) dragMoved = true;
    setHeight(startH + dy, false);
  };

  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    shell.classList.remove('dragging');
    document.body.style.userSelect = '';
    suppressClick = dragMoved; // ignore the click that follows a drag
  };

  handle.addEventListener('pointerdown', (e) => {
    handle.setPointerCapture?.(e.pointerId);
    beginDrag(e.clientY);
    e.preventDefault();
  });
  window.addEventListener('pointermove', (e) => moveDrag(e.clientY));
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // keyboard slider
  handle.addEventListener('keydown', (e) => {
    const hNow = parseFloat(backdrop.style.height || minH) || minH;
    let h = hNow;
    switch (e.key) {
      case 'ArrowUp':   h = hNow + step; break;
      case 'ArrowDown': h = hNow - step; break;
      case 'PageUp':    h = hNow + step * 3; break;
      case 'PageDown':  h = hNow - step * 3; break;
      case 'Home':      h = minH; break;
      case 'End':       h = maxH; break;
      case 'Escape':    h = minH; break;
      default: return;
    }
    setHeight(h);
    e.preventDefault();
  });


  handle.addEventListener('click', (e) => {
    if (suppressClick) { suppressClick = false; e.preventDefault(); }
  });

  // ARIA
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('tabindex', '0');
}

// ---------- boot ----------
function wireUp() {
  const preview = document.getElementById('preview');
  if (preview) {
    preview.querySelectorAll('img').forEach(i => (i.crossOrigin = 'anonymous'));
    recomputeAccent();

    const mo = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => { if (n.tagName === 'IMG') n.crossOrigin = 'anonymous'; });
        }
      });
      recomputeAccent();
    });

    mo.observe(preview, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'class']
    });
  }

  setupDropdown();
  setupChatPanel();
}

document.addEventListener('DOMContentLoaded', wireUp);
