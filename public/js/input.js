// Mouse and touch attraction (up to 4 pointers), and the kaleidoscope fold.

import { canvas } from './gl.js';
import { params } from './settings.js';
import { aspect } from './render-targets.js';
import { hideHint } from './hint.js';

// Kaleidoscope rotation angle, advanced by the frame loop.
export const kaleido = { rot: 0 };

// Same fold as the display shader, so touches pull particles to the spot you see.
export function fold(x, y) {
  const n = Math.round(params.mirrors);
  if (n < 2) return [x, y];
  const seg = Math.PI * 2 / n;
  let a = Math.atan2(y, x) - kaleido.rot;
  a = ((a % seg) + seg) % seg;
  a = Math.min(a, seg - a) + kaleido.rot;
  const r = Math.hypot(x, y);
  return [r * Math.cos(a), r * Math.sin(a)];
}

const pointers = new Map();

function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width * 2 - 1) * aspect,
          -((e.clientY - r.top) / r.height * 2 - 1)];
}

canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  const [x, y] = toWorld(e);
  pointers.set(e.pointerId, { x, y, s: 0, down: true });
  hideHint();
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (p && p.down) [p.x, p.y] = toWorld(e);
});
const release = e => { const p = pointers.get(e.pointerId); if (p) p.down = false; };
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', e => e.preventDefault());

const attrData = new Float32Array(16);

// Strength ramps up while held and fades out after release.
// Returns 4 × (x, y, strength, unused), folded into kaleidoscope space.
export function updateAttractors(dt) {
  attrData.fill(0);
  let k = 0;
  for (const [id, p] of pointers) {
    p.s = p.down ? Math.min(1, p.s + dt * 4) : p.s - dt * 3;
    if (p.s <= 0 && !p.down) { pointers.delete(id); continue; }
    if (k < 4) {
      const [fx, fy] = fold(p.x, p.y);
      attrData[k * 4] = fx; attrData[k * 4 + 1] = fy; attrData[k * 4 + 2] = Math.max(0, p.s);
      k++;
    }
  }
  return attrData;
}
