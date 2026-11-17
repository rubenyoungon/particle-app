// Settings panel, the top-right corner tile, and keyboard shortcuts.

import { params, MODES, COLOR_MODES, save } from './settings.js';
import { canvas } from './gl.js';
import { clearTrail } from './render-targets.js';
import { startSystemAudio, stopAudio } from './audio.js';

// paused: read by the frame loop.
export const ui = { paused: false };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const sliders = ['mirrors', 'mirrorSpin', 'audioReact', 'audioSensitivity'];
function refreshControls() {
  document.getElementById('mode').value = params.mode;
  for (const key of sliders) {
    const input = document.getElementById(key);
    input.value = params[key];
    document.querySelector(`output[for="${key}"]`).textContent = input.value;
  }
}

const actions = {
  stopSpin() { params.mirrorSpin = 0; refreshControls(); save(); },
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },
  randomize() {
    if (params.mode === 'Fountain') {
      Object.assign(params, {
        fountainHeight: rand(0.7, 1.4), fountainRing: rand(0.15, 0.6),
        fountainTail: rand(0.05, 0.3),
      });
      refreshControls(); save();
      return;
    }
    Object.assign(params, {
      flowScale: rand(0.6, 4), evolve: rand(0.03, 0.35), inertia: rand(0.8, 0.97),
      tail: rand(0.45, 0.85), hue: Math.random(), hueSpread: rand(0, 0.6),
      hueCycle: rand(0, 0.06), saturation: rand(0.5, 1), swirl: rand(-1, 1),
      colorMode: pick(COLOR_MODES), mirrors: pick([1, 1, 3, 4, 5, 6, 8, 12]),
      mirrorSpin: pick([0, 0, rand(-0.15, 0.15)]),
    });
    refreshControls(); save();
  },
  toggleMode() {
    params.mode = MODES[(MODES.indexOf(params.mode) + 1) % MODES.length];
    applyMode();
  },
};

// Each mode keeps its own kaleidoscope settings: mirrors/mirrorSpin are the active
// mode's values, otherMirrors/otherMirrorSpin the other mode's. Switching swaps them.
let shownMode = params.mode;
function applyMode() {
  if (params.mode !== shownMode) {
    [params.mirrors, params.otherMirrors] = [params.otherMirrors, params.mirrors];
    [params.mirrorSpin, params.otherMirrorSpin] = [params.otherMirrorSpin, params.mirrorSpin];
    shownMode = params.mode;
  }
  clearTrail();
  refreshControls(); save();
}

// ---------------------------------------------------------------- settings panel
document.getElementById('mode').addEventListener('change', e => {
  params.mode = e.target.value;
  applyMode();
});
for (const key of sliders) {
  const input = document.getElementById(key);
  if (key === 'mirrorSpin') {
    input.addEventListener('keydown', e => {
      if (params.mirrorSpin !== 0 || !['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) return;
      input.value = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0.05;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      e.preventDefault();
    });
  }
  input.addEventListener('input', () => {
    const value = Number(input.value);
    params[key] = key === 'mirrorSpin' && Math.abs(value) < 0.05 ? 0 : value;
    refreshControls();
    save();
  });
}
document.getElementById('stopSpin').addEventListener('click', actions.stopSpin);
document.getElementById('captureAudio').addEventListener('click', startSystemAudio);
document.getElementById('stopAudio').addEventListener('click', stopAudio);
refreshControls();

// ---------------------------------------------------------------- settings corner
// Hovering the top-right corner shows a tile; clicking it opens the panel.
const corner = document.getElementById('corner');
const tile = document.getElementById('tile');
let closeTimer = 0, pressingPanel = false;

function setPanelOpen(open) {
  corner.classList.toggle('open', open);
  tile.setAttribute('aria-expanded', String(open));
  if (!open) corner.classList.remove('show');
}
tile.addEventListener('click', () => setPanelOpen(!corner.classList.contains('open')));

function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    const a = document.activeElement;
    // Keep the panel open while dragging, using the dropdown, or navigating by keyboard.
    if (pressingPanel || (a && corner.contains(a) && (a.tagName === 'SELECT' || a.matches(':focus-visible')))) return scheduleClose();
    setPanelOpen(false);
  }, 700);
}
corner.addEventListener('pointerenter', () => clearTimeout(closeTimer));
corner.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') scheduleClose(); });
corner.addEventListener('pointerdown', () => { pressingPanel = true; corner.classList.add('show'); });
addEventListener('pointerup', () => { pressingPanel = false; });
addEventListener('pointercancel', () => { pressingPanel = false; });
canvas.addEventListener('pointerdown', () => setPanelOpen(false));   // tap the canvas to dismiss on touch screens

// ---------------------------------------------------------------- keyboard
addEventListener('keydown', e => {
  if (corner.contains(e.target) && e.key === 'Escape') {
    setPanelOpen(false);
    tile.focus();
    return;
  }
  if (corner.contains(e.target)) return;
  switch (e.key.toLowerCase()) {
    case 'h': setPanelOpen(!corner.classList.contains('open')); break;
    case 'f': actions.fullscreen(); break;
    case 'c': clearTrail(); break;
    case 'r': actions.randomize(); break;
    case 'v': actions.toggleMode(); break;
    case '0': actions.stopSpin(); break;
    case 'm': params.mirrors = params.mirrors >= 12 ? 1 : params.mirrors < 3 ? 3 : params.mirrors + (params.mirrors < 8 ? 1 : 4);
              refreshControls(); save(); break;
    case ' ': ui.paused = !ui.paused; e.preventDefault(); break;
  }
});
