// Default settings, and loading/saving the user's settings in the browser.

export const DEFAULTS = {
  mode: 'Flow',
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
  otherMirrors: 1,       // kaleidoscope settings of the mode not currently shown
  otherMirrorSpin: 0.0,
  attract: 1.0,
  swirl: 0.35,
  audioReact: 1.0,
  audioSensitivity: 1.0,
  fountainCount: 500,
  fountainScale: 2.0,    // multiplies the head size in Fountain mode
  fountainTail: 0.12,    // Fountain's own tail length (Flow uses tail)
  fountainSoftness: 1.5, // Softness: 0 = sharp, up to 4 = render at 1/16 size and blur up    // blob diameter; the screen is 2 units tall
  fountainHeight: 0.6,
  fountainRing: 0.35,    // approximate landing radius of the fountain's spray
  fountainLower: 0.6,    // blue (lower) fountain height relative to the red one
  fountainTilt: 0.2,
  fountainSpin: 0.1,
};
export const MODES = ['Flow', 'Fountain'];
export const COLOR_MODES = ['Rainbow', 'Speed', 'Radial', 'Mono'];
const STORAGE_KEY = 'particle-flow-settings-v2';

// The live settings object. Other modules read it every frame; the UI writes to it.
export const params = { ...DEFAULTS };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  for (const k in DEFAULTS) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) params[k] = saved[k];
  if (!MODES.includes(params.mode)) params.mode = DEFAULTS.mode;
  // Settings saved before each mode had its own kaleidoscope: the mirrors belonged
  // to Flow, so if Fountain is showing, give them back to Flow and start Fountain plain.
  // The fountain's default count dropped from 3000 to 500: settings saved with the
  // old default get the new one.
  if (params.fountainCount === 3000) params.fountainCount = DEFAULTS.fountainCount;
  // The fountain's heads are now drawn as solid discs at full size, so the size
  // scale changed: a size still at an old default gets the new one.
  if ([1.8, 5.4, 7, 2.4].includes(params.fountainScale)) params.fountainScale = DEFAULTS.fountainScale;
  // ...and lower by default: a height still at the old default gets the new one.
  if (params.fountainHeight === 1.0) params.fountainHeight = DEFAULTS.fountainHeight;
  if (!('otherMirrors' in saved) && params.mode === 'Fountain') {
    params.otherMirrors = params.mirrors;
    params.otherMirrorSpin = params.mirrorSpin;
    params.mirrors = 1;
    params.mirrorSpin = 0;
  }
} catch (e) { /* storage unavailable */ }

let saveTimer = 0;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(params)); } catch (e) {}
  }, 300);
}
