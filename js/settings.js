// Default settings, and loading/saving the user's settings in the browser.

export const DEFAULTS = {
  count: 150,
  speed: 1.0,
  flowScale: 1.6,
  evolve: 0.12,
  inertia: 0.92,
  spread: 0.3,
  tail: 0.5,
  lineWidth: 3.5,
  brightness: 1.0,
  headGlow: 1.0,
  headSize: 5,
  tailGlow: 0.35,
  colorMode: 'Rainbow',
  hue: 0.58,
  hueSpread: 0.3,
  hueCycle: 0.02,
  saturation: 0.85,
  resolution: 1.0,
  mirrors: 1,
  mirrorSpin: 0.0,
  attract: 1.0,
  swirl: 0.35,
  audioReact: 1.0,
  audioSensitivity: 1.0,
};
export const COLOR_MODES = ['Rainbow', 'Speed', 'Radial', 'Mono'];
const STORAGE_KEY = 'particle-flow-settings-v2';

// The live settings object. Other modules read it every frame; the UI writes to it.
export const params = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  for (const k in DEFAULTS) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) params[k] = saved[k];
} catch (e) { /* storage unavailable */ }

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch (e) {}
  }, 300);
}
