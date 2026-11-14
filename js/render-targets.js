// The off-screen buffers the particles are drawn into, and resizing with the window.
//   trail: tails; faded a little every frame instead of cleared
//   head:  head glows; cleared every frame

import { gl, canvas } from './gl.js';
import { params } from './settings.js';

export let trail = null, head = null, floatTrail = false;
export let fbW = 0, fbH = 0, aspect = 1;

export function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2) * params.resolution;
}

function makeTarget(old, w, h) {
  if (old) { gl.deleteTexture(old.tex); gl.deleteFramebuffer(old.fbo); }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, float: isFloat };
}

export function clearTrail() {
  gl.clearColor(0, 0, 0, 1);
  for (const t of [trail, head]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clear(gl.COLOR_BUFFER_BIT);
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
    head = makeTarget(head, w, h);
    floatTrail = trail.float;
    clearTrail();
  }
  aspect = fbW / fbH;
}
addEventListener('resize', resize);
