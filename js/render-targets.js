// The off-screen buffers the particles are drawn into, and resizing with the window.
//   trail: tails; faded a little every frame instead of cleared
//   head:  head glows; cleared every frame. It has a second texture, head.cover,
//          where Fountain counts how much red (r) and blue (g) heads cover each pixel.
//   soft:  for Fountain's Softness: soft[0] is a full-size copy of the finished
//          image, soft[i] is it shrunk to 1 / 2^i of the screen size.

import { gl, canvas } from './gl.js';
import { params } from './settings.js';

export let trail = null, head = null, floatTrail = false;
export const SOFT_LEVELS = 4;   // Softness 1..4: shrink to 1/2 .. 1/16 of the screen
export const soft = [];         // { tex, fbo, w, h } per level, 0 = full size
export let fbW = 0, fbH = 0, aspect = 1;

export function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2) * params.resolution;
}

function makeTexture() {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  return tex;
}

// withCover: also attach a second texture (head.cover) as colour attachment 1,
// and a depth buffer, so Fountain's nearer heads hide the ones behind them.
function makeTarget(old, w, h, withCover) {
  if (old) {
    gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fbo);
    if (old.cover) gl.deleteTexture(old.cover);
    if (old.depth) gl.deleteRenderbuffer(old.depth);
  }
  const tex = makeTexture();
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

  // Prefer a half-float buffer: smooth fades with no 8-bit "ghost" residue.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const isFloat = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  if (!isFloat) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  }
  let cover = null, depth = null;
  if (withCover) {
    cover = makeTexture();
    if (isFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, cover, 0);
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, cover, depth, float: isFloat };
}

export function clearTrail() {
  gl.clearColor(0, 0, 0, 0);   // head alpha 0: no Fountain head covers this pixel
  for (const t of [trail, head]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    if (t.cover) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (t.cover) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

// Match the canvas and buffers to the window size. Cheap when nothing changed.
export function resize() {
  const dpr = pixelRatio();
  const w = Math.max(1, Math.round(innerWidth * dpr));
  const h = Math.max(1, Math.round(innerHeight * dpr));
  if (w !== fbW || h !== fbH) {
    fbW = canvas.width = w;
    fbH = canvas.height = h;
    trail = makeTarget(trail, w, h);
    head = makeTarget(head, w, h, true);
    for (let i = 0; i <= SOFT_LEVELS; i++) {
      const sw = Math.max(1, Math.round(w / 2 ** i)), sh = Math.max(1, Math.round(h / 2 ** i));
      soft[i] = { ...makeTarget(soft[i], sw, sh), w: sw, h: sh };
    }
    floatTrail = trail.float;
    clearTrail();
  }
  aspect = fbW / fbH;
}
addEventListener('resize', resize);
