// Particle state on the GPU: two buffers that the simulation ping-pongs between.
// Per particle (8 floats): position.xy, velocity.xy, previous position.xy, brightness, seed.

import { gl } from './gl.js';
import { params } from './settings.js';
import { aspect } from './render-targets.js';

const STRIDE = 32;

// Corner ids 0..3, used to expand each particle into a quad when drawing.
const cornerBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 2, 3]), gl.STATIC_DRAW);

// src: index of the buffer holding the current state.
export const particles = { count: 0, buffers: [], updateVAOs: [], renderVAOs: [], src: 0 };

function makeVAO(buf, instanced) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(i);
    gl.vertexAttribPointer(i, 2, gl.FLOAT, false, STRIDE, i * 8);
    gl.vertexAttribDivisor(i, instanced ? 1 : 0);
  }
  if (instanced) {
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);
  return vao;
}

// Create params.count particles at random positions. Only called at startup and
// when the Count setting changes: particles are never removed otherwise.
export function rebuildParticles() {
  const P = particles;
  P.buffers.forEach(b => gl.deleteBuffer(b));
  P.updateVAOs.concat(P.renderVAOs).forEach(v => gl.deleteVertexArray(v));
  P.count = Math.max(1, Math.round(params.count));
  const d = new Float32Array(P.count * 8);
  for (let i = 0; i < P.count; i++) {
    const x = (Math.random() * 2 - 1) * aspect, y = Math.random() * 2 - 1, o = i * 8;
    d[o] = x; d[o + 1] = y; d[o + 4] = x; d[o + 5] = y;
    d[o + 6] = 1;
    d[o + 7] = Math.random();
  }
  P.buffers = [0, 1].map(() => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_COPY);
    return b;
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  P.updateVAOs = P.buffers.map(b => makeVAO(b, false));
  P.renderVAOs = P.buffers.map(b => makeVAO(b, true));
  P.src = 0;
}
