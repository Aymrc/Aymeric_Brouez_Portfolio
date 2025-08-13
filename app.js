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

  // allow cross-origin if server sends CORS headers
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

function wireUp() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  // set crossOrigin on any existing images
  preview.querySelectorAll('img').forEach(i => (i.crossOrigin = 'anonymous'));

  // initial compute
  recomputeAccent();

  // re-run when images change (src swap, class front/back, or DOM changes)
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

document.addEventListener('DOMContentLoaded', wireUp);
