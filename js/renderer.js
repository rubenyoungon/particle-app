// The GPU passes run each frame: simulate, fade the trails, draw tails and heads, show.

import { gl, program } from './gl.js';
import * as S from './shaders.js';
import { particles } from './particles.js';
import { trail, head, floatTrail, fbW, fbH, aspect } from './render-targets.js';

const updateProg  = program(S.UPDATE_VS, S.UPDATE_FS, S.UPDATE_VARYINGS);
const renderProg  = program(S.RENDER_VS, S.RENDER_FS);
const headProg    = program(S.HEAD_VS, S.HEAD_FS);
const solidProg   = program(S.QUAD_VS, S.SOLID_FS);
const displayProg = program(S.QUAD_VS, S.DISPLAY_FS);
const emptyVAO = gl.createVertexArray();
const tf = gl.createTransformFeedback();

// 1. Move every particle one step (transform feedback: reads one buffer, writes the other).
export function simulate(dt, s) {
  const P = particles, dst = 1 - P.src, u = updateProg.u;
  gl.useProgram(updateProg.p);
  gl.uniform1f(u.u_dt, dt);
  gl.uniform1f(u.u_time, s.time);
  gl.uniform1f(u.u_aspect, aspect);
  gl.uniform1f(u.u_speed, s.speed);
  gl.uniform1f(u.u_scale, s.scale);
  gl.uniform1f(u.u_inertia, s.inertia);
  gl.uniform1f(u.u_spread, s.spread);
  gl.uniform1f(u.u_attract, s.attract);
  gl.uniform1f(u.u_swirl, s.swirl);
  gl.uniform1f(u.u_kick, s.kick);
  gl.uniform4fv(u.u_attr, s.attractors);
  gl.bindVertexArray(P.updateVAOs[P.src]);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, P.buffers[dst]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, P.count);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  P.src = dst;
}

// 2. Darken the trail buffer a little, so old tail pieces fade out.
export function fadeTrails(fade) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, trail.fbo);
  gl.viewport(0, 0, fbW, fbH);
  gl.enable(gl.BLEND);
  gl.useProgram(solidProg.p);
  gl.bindVertexArray(emptyVAO);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);            // dst *= fade
  gl.uniform4f(solidProg.u.u_color, 0, 0, 0, fade);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (!floatTrail) {                                // 8-bit fallback: subtract to reach true black
    gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform4f(solidProg.u.u_color, 1 / 255, 1 / 255, 1 / 255, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  gl.disable(gl.BLEND);
}

// 3. Add this frame's tail pieces to the trail buffer, and draw fresh head glows.
// look: { widthPx, headSizePx, hue, hueSpread, saturation, intensity, colorMode, tailGlow, headGlow }
export function drawParticles(look) {
  const P = particles, px = 2 / fbH;
  const setColor = u => {
    gl.uniform1f(u.u_aspect, aspect);
    gl.uniform1f(u.u_hue, look.hue);
    gl.uniform1f(u.u_hueSpread, look.hueSpread);
    gl.uniform1f(u.u_sat, look.saturation);
    gl.uniform1f(u.u_intensity, look.intensity);
    gl.uniform1i(u.u_colorMode, look.colorMode);
  };
  gl.bindFramebuffer(gl.FRAMEBUFFER, trail.fbo);
  gl.viewport(0, 0, fbW, fbH);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(P.renderVAOs[P.src]);

  gl.useProgram(renderProg.p);
  gl.blendEquation(gl.MAX);                         // tails: overlapping ends don't stack
  setColor(renderProg.u);
  gl.uniform1f(renderProg.u.u_width, look.widthPx * px);
  gl.uniform1f(renderProg.u.u_tailGlow, look.tailGlow);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, P.count);

  gl.bindFramebuffer(gl.FRAMEBUFFER, head.fbo);     // heads: fresh every frame
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.blendEquation(gl.FUNC_ADD);                    // heads: additive glow
  gl.useProgram(headProg.p);
  setColor(headProg.u);
  gl.uniform1f(headProg.u.u_headSize, look.headSizePx * px);
  gl.uniform1f(headProg.u.u_headGlow, look.headGlow);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, P.count);
  gl.disable(gl.BLEND);
}

// 4. Show trails + heads on screen, through the kaleidoscope.
export function present(segments, rot) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, fbW, fbH);
  gl.useProgram(displayProg.p);
  gl.bindVertexArray(emptyVAO);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, trail.tex);
  gl.uniform1i(displayProg.u.u_tex, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, head.tex);
  gl.uniform1i(displayProg.u.u_head, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(displayProg.u.u_aspect, aspect);
  gl.uniform1f(displayProg.u.u_segments, segments);
  gl.uniform1f(displayProg.u.u_rot, rot);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
