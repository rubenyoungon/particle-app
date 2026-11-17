// The short message at the bottom of the screen.

const hintEl = document.getElementById('hint');
let hintTimer = setTimeout(hideHint, 7000);

export function hideHint() { hintEl.style.opacity = 0; }

export function showHint(text) {
  hintEl.textContent = text; hintEl.style.opacity = 1;
  clearTimeout(hintTimer); hintTimer = setTimeout(hideHint, 6000);
}
