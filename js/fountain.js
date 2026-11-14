// Fountain mode: two 3D particle fountains seen from slightly above, sharing one
// nozzle. A red fountain sprays up; below it a blue mirror image of it, just as
// wide but less tall, sprays down. Red heads and tails have a yellow middle,
// blue ones a light blue one.
//
// Per particle (8 floats): position.xyz, velocity.xyz, age, life.y.
// life.y packs two values: its fraction is the particle's random seed, its whole
// part counts how often it has bounced on the meeting plane since launch.
//
// The particles are simulated once, as an upward fountain (y up, nozzle and
// meeting plane at y = 0), and drawn twice: as the red fountain, and flipped
// upside down and flattened as the blue one (toWorld). So every red particle has
// a blue twin directly below it: the two leave the nozzle together and meet
// again when they come back down to the middle. There both bounce off the
// meeting plane (red up, blue down, mirrored), skipping outward in a run of low
// hops, then park hidden at the nozzle. Parked particles launch again at the
// flow rate main.js sets: in bursts on the music's beats, or steadily
// when no audio is captured. Where red and blue heads overlap a lot,
// the display pass turns them whiter.
// The draw passes project to the 2D screen space used by the rest of the app
// and draw into the shared trail/head buffers.

import { gl, program } from './gl.js';
import { trail, head, fbW, fbH, aspect } from './render-targets.js';
import { params } from './settings.js';

const STRIDE = 32;
const FLOOR = 0.0;          // the meeting plane, at the nozzle's height
const MAX_AGE = 8.0;
const MAX_BOUNCES = 8;      // bounces on the meeting plane before respawning
// Share of vertical speed kept at a bounce: the first bounce off the fall keeps
// little (a hop ~3% of the drop height), later ones keep most, so the particle
// skips along low for a while.
const RESTITUTION_FIRST = 0.18;
const RESTITUTION = 0.75;
// Highest any arc may fly, as a multiple of a normal launch's height, however
// strong the bass, beats and Reaction setting are.
const MAX_RISE = 1.6;
// Rough seconds one particle spends in the air (arc plus hops), used to turn
// the music's loudness into a launch rate.
const FLIGHT_CYCLE = 2.1;
// Downward pull in the simulation (it was 3; launch speeds scale to match).
const GRAVITY = 6.0;

// ---------------------------------------------------------------- shaders

const UPDATE_VARYINGS = ['v_pos', 'v_vel', 'v_life'];
const UPDATE_VS = /* glsl */`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_vel;
layout(location=2) in vec2 a_life;   // x: age in seconds (< 0: waiting to launch), y: bounces + seed
out vec3 v_pos; out vec3 v_vel; out vec2 v_life;
uniform float u_dt, u_time, u_height, u_ring, u_power, u_kick, u_rate;
uniform float u_burst;   // share of parked particles to launch this frame at once (on a beat)
// Strong gravity with matching fast launches: arcs reach the same height as
// before but faster, so a beat's burst peaks soon after it.
const float GRAVITY = ${GRAVITY.toFixed(1)};
const float SPEED = ${Math.sqrt(GRAVITY / 3).toFixed(4)};   // launch speed scale for the same height

// Hash without sin(), so it stays stable as the time value grows.
float hash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Upward launch speed of a normal (no bass, no beat) launch.
float baseUp(){ return 2.45 * SPEED * sqrt(u_height); }

// Horizontal direction from the nozzle out to the particle.
vec2 radialDir(vec3 p, vec3 v){
  if (dot(p.xz, p.xz) > 1e-8) return normalize(p.xz);
  return dot(v.xz, v.xz) > 1e-12 ? normalize(v.xz) : vec2(1.0, 0.0);
}

void main(){
  vec3 p = a_pos, v = a_vel;
  float seed = fract(a_life.y), bounces = floor(a_life.y), age = a_life.x + u_dt;
  bool waiting = a_life.x < 0.0;
  bool launch = false, done = false;

  if (waiting) {
    // Parked at the nozzle: launch at random, at u_rate launches per second
    // (set from the music's beats), plus a u_burst share all at once on a beat.
    age = -1.0;
    launch = hash(vec2(seed * 613.0, fract(u_time * 0.0191) * 7919.0)) < u_rate * u_dt + u_burst;
  } else {
    // No air drag and only a whisper of turbulence on the way up and down, so
    // each particle lands where its launch aimed it: on the ring.
    if (bounces < 0.5) {
      float t = u_time * 1.7 + seed * 40.0;
      v.xz += vec2(sin(t), cos(t * 1.3)) * 0.015 * u_dt;
    }
    v.y -= GRAVITY * u_dt;
    p += v * u_dt;
    // Back at the meeting plane: bounce off it (losing speed) a few times,
    // then respawn at the nozzle.
    if (p.y < ${FLOOR.toFixed(2)} && v.y < 0.0) {
      if (bounces < ${MAX_BOUNCES.toFixed(1)}) {
        p.y = ${FLOOR.toFixed(2)} - p.y;
        v.y = -v.y * (bounces < 0.5 ? ${RESTITUTION_FIRST.toFixed(2)} : ${RESTITUTION.toFixed(2)});
        // After the first landing, skip outward at a normal launch's sideways
        // speed whatever the arc was, so every particle hops the same way.
        if (bounces < 0.5) v.xz = radialDir(p, v) * (u_ring / (2.0 * baseUp() / GRAVITY));
        v.xz *= 0.95;
        bounces += 1.0;
      } else {
        done = true;
      }
    }
    if (age > ${MAX_AGE.toFixed(1)}) done = true;
  }

  if (done) {
    // Finished: park hidden at the nozzle until the music launches it again.
    p = vec3(0.0); v = vec3(0.0);
    age = -1.0;
    bounces = 0.0;
  }

  if (launch) {
    vec2 k = vec2(seed * 977.0, fract(u_time * 0.0137) * 6151.0);
    float r1 = hash(k), r3 = hash(k + 3.1), r4 = hash(k + 5.3);
    float ang = r1 * 6.2831853;
    vec3 dir = vec3(cos(ang), 0.0, sin(ang));
    // One spray: every particle goes up and outward in a random direction.
    // Its upward speed varies a little (and grows with bass and beats). However
    // high it flies, it lands on the ring (radius u_ring): its sideways speed is
    // constant, set so it covers the distance to the ring over its flight time
    // (a plain parabola: higher arcs are just steeper, not wider).
    float up = (mix(2.4, 2.5, r3) * sqrt(u_height) * u_power + u_kick) * SPEED;   // height grows with up^2
    up = min(up, baseUp() * ${Math.sqrt(MAX_RISE).toFixed(4)});           // at most MAX_RISE times as high
    float flight = 2.0 * up / GRAVITY;                                   // time until it is back at y = 0
    float start = 0.03 * r4;
    v = dir * (max(0.0, u_ring - start) / flight) + vec3(0.0, up, 0.0);
    p = dir * start;
    age = 0.0;
    bounces = 0.0;
  }

  v_pos = p; v_vel = v; v_life = vec2(age, bounces + seed);
}`;
const UPDATE_FS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(0.0); }`;

// Shared by the tail and head vertex shaders: placing, projection and colour.
const COMMON = /* glsl */`
uniform float u_aspect, u_yaw, u_tilt, u_zoom, u_height, u_intensity, u_sat, u_dt;
uniform float u_lower;       // height of the blue fountain relative to the red one
uniform float u_lowerPass;   // 1 while drawing the blue fountain, 0 for the red one

bool isLower(){ return u_lowerPass > 0.5; }

// Simulated position -> world position. In the blue pass the particle is
// flipped upside down and its height scaled by u_lower; x and z stay the same,
// so both fountains are equally wide and each red particle's twin is right below it.
vec3 toWorld(vec3 p){
  return isLower() ? vec3(p.x, -p.y * u_lower, p.z) : p;
}

// 3D world position -> 2D app space (x in [-aspect, aspect], y in [-1, 1]);
// z is the perspective scale, used to size the heads.
vec3 project(vec3 p){
  float c = cos(u_yaw), s = sin(u_yaw);
  // Shift down by the middle of the two fountains' total height, to centre them.
  float mid = 0.5 * u_height * (1.0 - u_lower);   // the red top is ~1.0 * height
  p = vec3(c * p.x + s * p.z, p.y - mid, -s * p.x + c * p.z);
  float ct = cos(u_tilt), st = sin(u_tilt);
  p = vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);   // look down slightly
  const float D = 3.0;                                          // camera distance
  float k = u_zoom * D / max(0.3, D - p.z);
  return vec3(p.xy * k, k);
}

// Bounces on the meeting plane since launch.
float bounces(vec2 life){ return floor(life.y); }

// How visible the particle is, 0..1. It fades in just after launch and out at
// the end of its last bounce. pos is the simulated position.
float fountainFade(vec3 pos, vec2 life){
  float b = bounces(life);
  float f = smoothstep(0.0, 0.08, life.x);
  if (b >= ${MAX_BOUNCES.toFixed(1)}) f *= smoothstep(${FLOOR.toFixed(2)}, ${(FLOOR + 0.02).toFixed(2)}, pos.y);
  return f;
}

// Saturation and intensity applied to a raw fountain colour.
vec3 grade(vec3 c){
  c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, u_sat);
  return c * u_intensity;
}

// One colour per fountain, the same at every height: bright red and blue.
vec3 fountainColor(vec3 pos, vec2 life){
  return grade(isLower()
    ? vec3(0.1, 0.22, 1.0)
    : vec3(1.0, 0.18, 0.1) * 1.8);   // bright red
}

// Each fountain's secondary colour, which fills the middle of its heads:
// yellow for the red fountain, light blue for the blue one.
vec3 fountainSecondary(){
  return grade(isLower()
    ? vec3(0.35, 0.78, 1.0)          // light blue
    : vec3(1.0, 0.8, 0.1) * 1.4);    // yellow
}`;

const TAIL_HALO = 1.5;   // capsule reach in half-widths: just past the edge (no halo)
// Heads and tails are solid out to this share of their radius, then fade out
// softly to the edge. 1.0 would be a hard edge.
const EDGE_SOFT_START = '0.35';
const TAIL_VS = /* glsl */`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_vel;
layout(location=2) in vec2 a_life;
layout(location=4) in float a_corner;
uniform float u_width;
${COMMON}
out vec3 v_col; out vec3 v_col2; out vec2 v_pa; flat out vec2 v_ba; flat out float v_width;
void main(){
  vec3 sc = project(toWorld(a_pos));
  vec2 cur = sc.xy;
  vec2 prv = project(toWorld(a_pos - a_vel * u_dt)).xy;
  // Same perspective scaling as the heads, so a tail is exactly as wide as its head.
  v_width = u_width * sc.z;
  float end = floor(a_corner * 0.5);
  float side = mod(a_corner, 2.0) * 2.0 - 1.0;
  vec2 d = cur - prv;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float r = v_width * 0.5 * ${TAIL_HALO.toFixed(1)};
  vec2 p = mix(prv, cur, end) + n * side * r + dir * (end * 2.0 - 1.0) * r;
  gl_Position = vec4(p.x / u_aspect, p.y, 0.0, 1.0);
  bool live = a_life.x > u_dt;    // no tail on the launch frame
  float fade = live && len > 1e-6 ? fountainFade(a_pos, a_life) : 0.0;
  v_col = fountainColor(a_pos, a_life) * fade;
  v_col2 = fountainSecondary() * fade;
  v_pa = p - prv;
  v_ba = d;
}`;

const HEAD_VS = /* glsl */`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=2) in vec2 a_life;
layout(location=4) in float a_corner;
uniform float u_headSize;
${COMMON}
out vec3 v_col; out vec3 v_col2; out vec2 v_uv; out float v_alpha;
void main(){
  v_col2 = fountainSecondary();
  vec2 c = vec2(mod(a_corner, 2.0), floor(a_corner * 0.5)) * 2.0 - 1.0;
  v_uv = c;
  vec3 s = project(toWorld(a_pos));
  vec2 p = s.xy + c * u_headSize * 0.5 * s.z;   // nearer heads look bigger
  // Depth: nearer heads (bigger perspective scale) get a smaller value, so the
  // depth test lets them hide the heads behind them.
  gl_Position = vec4(p.x / u_aspect, p.y, clamp(1.5 - s.z, -1.0, 1.0), 1.0);
  v_col = fountainColor(a_pos, a_life);
  // Fading heads turn see-through (not dark), since heads cover what is behind them.
  v_alpha = a_life.x >= 0.0 ? fountainFade(a_pos, a_life) : 0.0;
}`;

// Tail: a solid line segment with round ends and a soft edge, but no glow halo
// around it (unlike the Flow tails).
const TAIL_FS = /* glsl */`#version 300 es
precision highp float;
in vec3 v_col; in vec3 v_col2; in vec2 v_pa; flat in vec2 v_ba; flat in float v_width; out vec4 o;
void main(){
  float bb = dot(v_ba, v_ba);
  float h = bb > 0.0 ? clamp(dot(v_pa, v_ba) / bb, 0.0, 1.0) : 0.0;
  float d = length(v_pa - v_ba * h);           // distance to the segment
  float r = v_width * 0.5;
  // Secondary colour along the middle of the tail, main colour toward its edges.
  vec3 col = mix(v_col, v_col2, 0.9 * (1.0 - smoothstep(0.0, 0.65, d / max(r, 1e-6))));
  o = vec4(col * (1.0 - smoothstep(r * ${EDGE_SOFT_START}, r, d)), 1.0);   // soft edge
}`;

// Head: an opaque disc filling its quad, darkening and fading out toward its
// edge, with no glow. It is composited *over* the trails in its own colour (not added as
// light, which looked like see-through glare). It is brightest in the centre,
// where its colour also turns toward white.
// Output 0 (head colour) is premultiplied: rgb = colour * coverage, a = coverage.
// Output 1 (head.cover) adds this head's coverage to r for red heads or g for
// blue ones, so the display pass can tell where red and blue heads overlap.
const HEAD_FS = /* glsl */`#version 300 es
precision highp float;
uniform float u_headGlow, u_lowerPass;
uniform float u_depthPass;   // 1: depth-only prepass (writes depth for the solid core)
in vec3 v_col; in vec3 v_col2; in vec2 v_uv; in float v_alpha;
layout(location=0) out vec4 o;
layout(location=1) out vec4 o_cover;
void main(){
  float r = length(v_uv);
  float a = (1.0 - smoothstep(${EDGE_SOFT_START}, 1.0, r)) * v_alpha;   // solid middle, soft edge
  if (u_depthPass > 0.5) {
    // Only the mostly solid part of a head blocks what is behind it; its soft
    // edge doesn't, so heads behind still show around it.
    if (a < 0.5) discard;
    o = vec4(0.0); o_cover = vec4(0.0);
    return;
  }
  if (a <= 0.001) discard;
  // Secondary colour in the middle, blending out to the main colour at the edge.
  vec3 base = mix(v_col, v_col2, 0.9 * (1.0 - smoothstep(0.0, 0.65, r)));
  float m = max(base.r, max(base.g, base.b));
  // Bright centre: the colour brightens and whitens toward the middle, and
  // darkens toward the edge, so the head blends gradually into the background.
  float g = 1.0 - r * r;
  // Red heads are more solid and darken less at the edge than blue ones, so the
  // red reads vivid instead of dull.
  bool red = u_lowerPass < 0.5;
  float edgeDark = mix(1.0, red ? 0.55 : 0.2, smoothstep(0.25, 1.0, r));
  vec3 c = (base * (0.7 + 0.6 * g) + vec3(m) * 0.15 * g * g) * edgeDark * u_headGlow;
  a *= red ? 0.95 : 0.8;   // slightly see-through, so the head sits into its tail
  o = vec4(min(c, vec3(1.0)) * a, a);
  // added up with additive blending in drawFountain's coverage pass
  o_cover =u_lowerPass > 0.5 ? vec4(0.0, a, 0.0, 0.0) : vec4(a, 0.0, 0.0, 0.0);
}`;

// ---------------------------------------------------------------- GPU state

let updateProg = null, tailProg = null, headProg = null;
const tf = gl.createTransformFeedback();
const cornerBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 2, 3]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

const F = { count: 0, buffers: [], updateVAOs: [], renderVAOs: [], src: 0 };

function makeVAO(buf, instanced) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const attrs = [[0, 3, 0], [1, 3, 12], [2, 2, 24]];   // location, size, byte offset
  for (const [loc, size, off] of attrs) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, STRIDE, off);
    gl.vertexAttribDivisor(loc, instanced ? 1 : 0);
  }
  if (instanced) {
    gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 0);
  }
  gl.bindVertexArray(null);
  return vao;
}

// Create params.fountainCount particles, all parked at the nozzle until they
// are launched (by music, or steadily when no audio is captured).
export function rebuildFountain() {
  if (!updateProg) {
    updateProg = program(UPDATE_VS, UPDATE_FS, UPDATE_VARYINGS);
    tailProg = program(TAIL_VS, TAIL_FS);
    headProg = program(HEAD_VS, HEAD_FS);
  }
  F.buffers.forEach(b => gl.deleteBuffer(b));
  F.updateVAOs.concat(F.renderVAOs).forEach(v => gl.deleteVertexArray(v));
  F.count = Math.max(1, Math.round(params.fountainCount));
  const d = new Float32Array(F.count * 8);
  for (let i = 0; i < F.count; i++) {
    d[i * 8 + 6] = -1;              // age < 0: parked
    d[i * 8 + 7] = Math.random();   // seed
  }
  F.buffers = [0, 1].map(() => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_COPY);
    return b;
  });
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  F.updateVAOs = F.buffers.map(b => makeVAO(b, false));
  F.renderVAOs = F.buffers.map(b => makeVAO(b, true));
  F.src = 0;
}

// s: { time, height, ring (landing radius), power, kick,
//      flow (0..1: 0 = no new launches, 1 = a full stream),
//      burst (0..1: share of parked particles to launch at once this frame) }
export function simulateFountain(dt, s) {
  if (!F.count) rebuildFountain();
  const dst = 1 - F.src, u = updateProg.u;
  // Launch rate per parked particle such that about a `flow` share of all
  // particles are in the air: in steady state that share is
  // C*rate / (1 + C*rate), with C the time one particle spends flying.
  const f = Math.min(0.97, Math.max(0, s.flow));
  gl.useProgram(updateProg.p);
  gl.uniform1f(u.u_rate, f / ((1 - f) * FLIGHT_CYCLE));
  gl.uniform1f(u.u_dt, dt);
  gl.uniform1f(u.u_time, s.time);
  gl.uniform1f(u.u_height, s.height);
  gl.uniform1f(u.u_ring, s.ring);
  gl.uniform1f(u.u_power, s.power);
  gl.uniform1f(u.u_kick, s.kick);
  gl.uniform1f(u.u_burst, s.burst || 0);
  gl.bindVertexArray(F.updateVAOs[F.src]);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, F.buffers[dst]);
  gl.enable(gl.RASTERIZER_DISCARD);
  gl.beginTransformFeedback(gl.POINTS);
  gl.drawArrays(gl.POINTS, 0, F.count);
  gl.endTransformFeedback();
  gl.disable(gl.RASTERIZER_DISCARD);
  gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
  gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
  F.src = dst;
}

// Each particle adds a soft-edged tail segment into the fading trail buffer
// (light, tone-mapped on display), and an opaque disc head that the display
// pass lays over it.
// look: { widthPx (tail width, scaled by perspective like the heads),
//         headSizePx (head diameter), intensity (tails),
//         headIntensity, saturation, headGlow }; cam: { dt, yaw, tilt, zoom, height, lower }
export function drawFountain(look, cam) {
  if (!F.count) return;
  const px = 2 / fbH;
  const setCommon = (u, intensity) => {
    gl.uniform1f(u.u_aspect, aspect);
    gl.uniform1f(u.u_yaw, cam.yaw);
    gl.uniform1f(u.u_tilt, cam.tilt);
    gl.uniform1f(u.u_zoom, cam.zoom);
    gl.uniform1f(u.u_height, cam.height);
    gl.uniform1f(u.u_dt, cam.dt);
    gl.uniform1f(u.u_intensity, intensity);
    gl.uniform1f(u.u_sat, look.saturation);
    gl.uniform1f(u.u_lower, cam.lower);
  };
  gl.bindFramebuffer(gl.FRAMEBUFFER, trail.fbo);
  gl.viewport(0, 0, fbW, fbH);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.bindVertexArray(F.renderVAOs[F.src]);

  gl.useProgram(tailProg.p);
  gl.blendEquation(gl.MAX);                         // tails: overlapping ends don't stack
  setCommon(tailProg.u, look.intensity);
  gl.uniform1f(tailProg.u.u_width, look.widthPx * px);
  for (const lower of [0, 1]) {                     // red fountain, then its blue mirror
    gl.uniform1f(tailProg.u.u_lowerPass, lower);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, F.count);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, head.fbo);     // heads: fresh every frame
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);   // colour + red/blue coverage
  gl.clearColor(0, 0, 0, 0);                        // alpha 0: nothing covers the trails
  gl.clearDepth(1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(headProg.p);
  setCommon(headProg.u, look.headIntensity);
  gl.uniform1f(headProg.u.u_headSize, look.headSizePx * px);
  gl.uniform1f(headProg.u.u_headGlow, look.headGlow);
  const drawHeads = () => {
    for (const lower of [0, 1]) {                   // red fountain, then its blue mirror
      gl.uniform1f(headProg.u.u_lowerPass, lower);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, F.count);
    }
  };
  // 1. Coverage: add up how much red and how much blue heads cover each pixel,
  //    hidden or not (no depth test), so red-blue overlap is found even where
  //    one head is behind the other. Written to head.cover only.
  gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.uniform1f(headProg.u.u_depthPass, 0);
  drawHeads();
  gl.enable(gl.DEPTH_TEST);

  // 2. Depth prepass: record how near the nearest head's solid core is at each
  //    pixel, so heads further back can't be drawn over nearer ones.
  gl.disable(gl.BLEND);
  gl.colorMask(false, false, false, false);
  gl.depthMask(true);
  gl.depthFunc(gl.LESS);
  gl.uniform1f(headProg.u.u_depthPass, 1);
  drawHeads();

  // 3. Colour: only heads at least as near as that get drawn, to head colour
  //    only. Premultiplied "over": heads cover what is behind them.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  gl.colorMask(true, true, true, true);
  gl.depthMask(false);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendEquation(gl.FUNC_ADD);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.uniform1f(headProg.u.u_depthPass, 0);
  drawHeads();

  gl.depthMask(true);
  gl.disable(gl.DEPTH_TEST);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);           // Flow's head pass writes colour only
  gl.disable(gl.BLEND);
}
