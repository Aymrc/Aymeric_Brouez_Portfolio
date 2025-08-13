// (keep your rgbToHsl, getAccentColorFromImage, setAccent exactly as you have)

// Public API
export function applyAccentFromImage(imgEl) {
  const color = getAccentColorFromImage(imgEl);
  setAccent(color);
}

// Optional auto-init: looks for the first element with data-accent-source
document.addEventListener('DOMContentLoaded', () => {
  const img = document.querySelector('[data-accent-source]');
  if (!img) return;
  const run = () => applyAccentFromImage(img);
  img.complete ? run() : img.addEventListener('load', run, { once: true });
});
