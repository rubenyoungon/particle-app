// Settings panel (lil-gui), the top-right corner tile, and keyboard shortcuts.

import { params, DEFAULTS, COLOR_MODES, save } from './settings.js';
import { canvas } from './gl.js';
import { resize, clearTrail } from './render-targets.js';
import { rebuildParticles } from './particles.js';
import { startSystemAudio, stopAudio } from './audio.js';

// paused: read by the frame loop.
export const ui = { paused: false };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
let gui = null;
function refreshGui() { if (gui) gui.controllersRecursive().forEach(c => c.updateDisplay()); }

const actions = {
  system: startSystemAudio,
  stopAudio,
  clear: clearTrail,
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  },
  randomize() {
    Object.assign(params, {
      flowScale: rand(0.6, 4), evolve: rand(0.03, 0.35), inertia: rand(0.8, 0.97),
      tail: rand(0.45, 0.85), hue: Math.random(), hueSpread: rand(0, 0.6),
      hueCycle: rand(0, 0.06), saturation: rand(0.5, 1), swirl: rand(-1, 1),
      colorMode: pick(COLOR_MODES), mirrors: pick([1, 1, 3, 4, 5, 6, 8, 12]),
      mirrorSpin: pick([0, 0, rand(-0.15, 0.15)]),
    });
    refreshGui(); save();
  },
  reset() {
    const oldCount = params.count;
    Object.assign(params, DEFAULTS);
    if (params.count !== oldCount) rebuildParticles();
    resize(); refreshGui(); save();
  },
};

// ---------------------------------------------------------------- settings panel
// lil-gui is loaded from a CDN as a classic script; without it the app runs with no panel.
if (window.lil) {
  gui = new lil.GUI({ title: 'Particle Flow', container: document.getElementById('panel') });
  const fP = gui.addFolder('Particles');
  fP.add(params, 'count', 10, 20000, 10).name('Count').onFinishChange(rebuildParticles);
  fP.add(params, 'speed', 0, 4, 0.01).name('Speed');
  fP.add(params, 'flowScale', 0.2, 6, 0.01).name('Flow scale');
  fP.add(params, 'evolve', 0, 1, 0.01).name('Flow change');
  fP.add(params, 'inertia', 0, 0.99, 0.01).name('Smoothness');
  fP.add(params, 'spread', 0, 2, 0.01).name('Spread');
  const fL = gui.addFolder('Look');
  fL.add(params, 'tail', 0, 1, 0.001).name('Tail length');
  fL.add(params, 'lineWidth', 0.5, 12, 0.1).name('Line width');
  fL.add(params, 'brightness', 0.05, 4, 0.01).name('Brightness');
  fL.add(params, 'headGlow', 0, 4, 0.01).name('Head glow');
  fL.add(params, 'headSize', 2, 16, 0.1).name('Head size');
  fL.add(params, 'tailGlow', 0, 2, 0.01).name('Tail glow');
  fL.add(params, 'colorMode', COLOR_MODES).name('Color mode');
  fL.add(params, 'hue', 0, 1, 0.001).name('Hue');
  fL.add(params, 'hueSpread', 0, 1, 0.001).name('Hue spread');
  fL.add(params, 'hueCycle', 0, 0.3, 0.001).name('Hue cycling');
  fL.add(params, 'saturation', 0, 1, 0.01).name('Saturation');
  fL.add(params, 'resolution', 0.5, 1, 0.05).name('Resolution').onFinishChange(resize);
  const fK = gui.addFolder('Kaleidoscope');
  fK.add(params, 'mirrors', 1, 16, 1).name('Segments (1 = off)');
  fK.add(params, 'mirrorSpin', -1, 1, 0.01).name('Rotation speed');
  const fT = gui.addFolder('Touch');
  fT.add(params, 'attract', 0, 3, 0.01).name('Attraction');
  fT.add(params, 'swirl', -2, 2, 0.01).name('Swirl');
  const fS = gui.addFolder('Sound');
  fS.add(actions, 'system').name('Capture computer audio');
  fS.add(actions, 'stopAudio').name('Stop audio');
  fS.add(params, 'audioReact', 0, 3, 0.01).name('Reaction');
  fS.add(params, 'audioSensitivity', 0.2, 4, 0.01).name('Sensitivity');
  gui.add(actions, 'randomize').name('Randomize (R)');
  gui.add(actions, 'clear').name('Clear (C)');
  gui.add(actions, 'fullscreen').name('Fullscreen (F)');
  gui.add(actions, 'reset').name('Reset settings');
  gui.onChange(save);
}

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
    // keep it open while dragging a slider or using a dropdown
    if (pressingPanel || (a && a.tagName === 'SELECT' && corner.contains(a))) return scheduleClose();
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key.toLowerCase()) {
    case 'h': setPanelOpen(!corner.classList.contains('open')); break;
    case 'f': actions.fullscreen(); break;
    case 'c': clearTrail(); break;
    case 'r': actions.randomize(); break;
    case 'm': params.mirrors = params.mirrors >= 12 ? 1 : params.mirrors < 3 ? 3 : params.mirrors + (params.mirrors < 8 ? 1 : 4);
              refreshGui(); save(); break;
    case ' ': ui.paused = !ui.paused; e.preventDefault(); break;
  }
});
