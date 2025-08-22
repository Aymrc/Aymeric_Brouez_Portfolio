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

function hslToRgb(h, s, l) {
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
}

// make the picked color "pop"
function popAccent(cssColor, { minS = 0.7, targetL = 0.68, strength = 0.5 } = {}) { // minS = saturation / targetL =  brightness / strenght = agressivity
  const [r, g, b] = cssColor.match(/\d+/g).map(Number);
  let [h, s, l] = rgbToHsl(r, g, b);
  s = Math.max(s, minS); // ensure better saturation
  l = l + (targetL - l) * strength; // ease lightness toward more punchy mid
  const [R, G, B] = hslToRgb(h, s, l);
  return `rgb(${R}, ${G}, ${B})`;
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
  const punchy = popAccent(cssColor);
  document.documentElement.style.setProperty('--accent-color', punchy);

  const [r,g,b] = punchy.match(/\d+/g).map(Number);
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


function fitLeadToBar() {
  const bar  = document.querySelector('.main-bar');
  const lead = document.querySelector('.elevator-speech .lead');
  if (!bar || !lead) return;

  // target dimensions
  const barRect   = bar.getBoundingClientRect();
  const targetW   = Math.floor(barRect.width);
  const targetH   = Math.floor(barRect.height);   // cap so text never taller than bar
  const heightCap = Math.max(1, Math.floor(targetW)); // small breathing room

  // prepare for measurement
  const prev = lead.style.fontSize;
  lead.style.fontSize = '1px'; // start tiny to measure cleanly

  // binary search the max font-size that keeps lead <= bar width
  const measureFits = (px) => {
    lead.style.fontSize = px + 'px';
    // clientWidth/scrollWidth both work; scrollWidth is stricter if overflow is hidden
    return lead.scrollWidth <= targetW;
  };

  let lo = 1, hi = 512; // sane bounds
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureFits(mid)) lo = mid; else hi = mid - 1;
  }

  // apply width-based size, then cap by height
  const widthFit = lo;
  const finalPx  = Math.min(widthFit, heightCap);
  lead.style.fontSize = finalPx + 'px';

  // If you want the text exactly the bar height (not 0.9), set heightCap = targetH
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
      fitLeadToBar(); // preview image swap can change bar width
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

  // Re-fit on viewport resize
  window.addEventListener('resize', fitLeadToBar);

  // Re-fit when fonts are ready (so measurements are accurate)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(fitLeadToBar);
  }

  // Re-fit once DOM is painted
  requestAnimationFrame(fitLeadToBar);

  // Also observe the bar itself (width can change if its contents change)
  const bar = document.querySelector('.main-bar');
  if (bar && 'ResizeObserver' in window) {
    const ro = new ResizeObserver(fitLeadToBar);
    ro.observe(bar);
  }
}

document.addEventListener('DOMContentLoaded', wireUp);
