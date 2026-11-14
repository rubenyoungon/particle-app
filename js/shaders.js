// GPU shader code (GLSL ES 3.0).
// World space: y in [-1, 1], x in [-aspect, aspect].

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

// Simulation step, run with transform feedback (positions live on the GPU).
export const UPDATE_VARYINGS = ['v_pos', 'v_vel', 'v_prev', 'v_life'];
export const UPDATE_VS = /* glsl */`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_vel;
layout(location=2) in vec2 a_prev;
layout(location=3) in vec2 a_life;   // x: brightness (always 1), y: per-particle seed
out vec2 v_pos; out vec2 v_vel; out vec2 v_prev; out vec2 v_life;
uniform float u_dt, u_time, u_aspect, u_speed, u_scale, u_inertia, u_spread;
uniform float u_attract, u_swirl, u_kick;
uniform vec4 u_attr[4];              // xy: position, z: strength (0 = inactive)
${NOISE}
vec2 curl(vec3 q){
  const float e = 0.02;
  float a = snoise(q + vec3(0.0, e, 0.0)) - snoise(q - vec3(0.0, e, 0.0));
  float b = snoise(q + vec3(e, 0.0, 0.0)) - snoise(q - vec3(e, 0.0, 0.0));
  return vec2(a, -b) / (2.0 * e);
}
void main(){
  vec2 p = a_pos, v = a_vel;
  float life = a_life.x;

  // Divergence-free flow field, so particles swirl without clumping.
  vec3 q = vec3(p * u_scale, u_time);
  vec2 flow = curl(q) + 0.5 * curl(q * 2.13 + vec3(13.1, 7.7, 3.3));
  vec2 target = flow * (0.09 * u_speed);

  for (int i = 0; i < 4; i++) {
    vec4 A = u_attr[i];
    if (A.z <= 0.0) continue;
    vec2 d = A.xy - p;
    float r = length(d) + 1e-4;
    vec2 dir = d / r;
    float near = smoothstep(0.0, 0.08, r);
    target += (dir * near + vec2(-dir.y, dir.x) * u_swirl * (0.3 + near)) * (0.8 * u_attract * A.z);
  }
  target += normalize(p + 1e-4) * u_kick;   // sound beats push outward

  // Each particle also drifts in its own slowly turning direction, so particles
  // pulled together by a touch gradually spread out again.
  float seed = a_life.y;
  float ang = seed * 43.98 + u_time * (1.0 + seed * 2.0);
  target += vec2(cos(ang), sin(ang)) * (0.1 * u_spread * u_speed);

  v = mix(target, v, pow(u_inertia, u_dt * 60.0));
  vec2 prev = p;
  p += v * u_dt;

  // Particles live forever: leaving one edge brings them back in at the opposite edge.
  vec2 B = vec2(u_aspect + 0.05, 1.05);
  if (any(greaterThan(abs(p), B))) {
    p = mod(p + B, 2.0 * B) - B;
    prev = p;   // no streak across the screen
  }
  v_pos = p; v_vel = v; v_prev = prev; v_life = vec2(life, seed);
}`;
export const UPDATE_FS = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(0.0); }`;

const COLOR_GLSL = /* glsl */`
uniform float u_hue, u_hueSpread, u_sat, u_intensity;
uniform int u_colorMode;
vec3 hsv2rgb(vec3 c){
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 particleColor(vec2 pos, vec2 vel, vec2 life){
  float seed = life.y, h;
  if (u_colorMode == 0)      h = u_hue + seed * u_hueSpread;
  else if (u_colorMode == 1) h = u_hue + length(vel) * u_hueSpread * 2.5;
  else if (u_colorMode == 2) h = u_hue + length(pos) * u_hueSpread;
  else                       h = u_hue + (seed - 0.5) * 0.04;
  return hsv2rgb(vec3(fract(h), u_sat, 1.0)) * u_intensity * smoothstep(0.0, 0.7, life.x);
}`;

// Tail: each frame, every particle adds one soft capsule (a segment with round ends)
// from its previous to its current position into the fading trail buffer. Brightness
// comes from the exact distance to the segment, so edges are smooth at any angle, and
// round ends close the gaps at bends. Tails are blended with MAX, so overlapping ends
// don't add up into bright dots.
const TAIL_HALO = 4.0;   // the capsule reaches this many line half-widths out, to fit the glow halo
export const RENDER_VS = /* glsl */`#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_vel;
layout(location=2) in vec2 a_prev;
layout(location=3) in vec2 a_life;
layout(location=4) in float a_corner;  // 0..3
uniform float u_aspect, u_width;
${COLOR_GLSL}
out vec3 v_col; out vec2 v_pa; flat out vec2 v_ba;
void main(){
  float end = floor(a_corner * 0.5);
  float side = mod(a_corner, 2.0) * 2.0 - 1.0;
  vec2 d = a_pos - a_prev;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 n = vec2(-dir.y, dir.x);
  float r = u_width * 0.5 * ${TAIL_HALO.toFixed(1)};
  vec2 p = mix(a_prev, a_pos, end) + n * side * r + dir * (end * 2.0 - 1.0) * r;
  gl_Position = vec4(p.x / u_aspect, p.y, 0.0, 1.0);
  v_col = len > 1e-6 ? particleColor(a_pos, a_vel, a_life) : vec3(0.0);
  v_pa = p - a_prev;
  v_ba = d;
}`;
export const RENDER_FS = /* glsl */`#version 300 es
precision highp float;
uniform float u_tailGlow, u_width;
in vec3 v_col; in vec2 v_pa; flat in vec2 v_ba; out vec4 o;
void main(){
  float bb = dot(v_ba, v_ba);
  float h = bb > 0.0 ? clamp(dot(v_pa, v_ba) / bb, 0.0, 1.0) : 0.0;
  float x = length(v_pa - v_ba * h) / (u_width * 0.5);   // distance to the segment, in half-widths
  float core = exp(-x * x * 1.2);
  float halo = exp(-x * x * 0.18) * u_tailGlow;
  o = vec4(v_col * (core + halo), 1.0);
}`;

// Head: a round glow sprite at each particle's current position. It is drawn into
// its own buffer that is cleared every frame, so it never smears into the tail.
export const HEAD_VS = /* glsl */`#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in vec2 a_vel;
layout(location=3) in vec2 a_life;
layout(location=4) in float a_corner;
uniform float u_aspect, u_headSize;
${COLOR_GLSL}
out vec3 v_col; out vec2 v_uv;
void main(){
  vec2 c = vec2(mod(a_corner, 2.0), floor(a_corner * 0.5)) * 2.0 - 1.0;
  v_uv = c;
  vec2 p = a_pos + c * u_headSize * 0.5;
  gl_Position = vec4(p.x / u_aspect, p.y, 0.0, 1.0);
  v_col = particleColor(a_pos, a_vel, a_life);
}`;
export const HEAD_FS = /* glsl */`#version 300 es
precision highp float;
uniform float u_headGlow;
in vec3 v_col; in vec2 v_uv; out vec4 o;
void main(){
  float r2 = dot(v_uv, v_uv);
  float core = exp(-r2 * 45.0);
  float glow = exp(-r2 * 6.0);
  o = vec4(v_col * u_headGlow * (core * 2.0 + glow * 0.6), 1.0);
}`;

// Full-screen triangle, used by the fade and display passes.
export const QUAD_VS = `#version 300 es
out vec2 v_uv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
export const SOLID_FS = `#version 300 es
precision highp float; uniform vec4 u_color; out vec4 o; void main(){ o = u_color; }`;

// Final pass: kaleidoscope fold + tone mapping.
export const DISPLAY_FS = /* glsl */`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
uniform sampler2D u_tex, u_head;
uniform float u_aspect, u_segments, u_rot;
void main(){
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_aspect;
  if (u_segments > 1.5) {
    float seg = 6.28318530718 / u_segments;
    float a = mod(atan(p.y, p.x) - u_rot, seg);
    a = min(a, seg - a) + u_rot;
    p = length(p) * vec2(cos(a), sin(a));
  }
  vec2 uv = vec2(p.x / u_aspect, p.y) * 0.5 + 0.5;
  vec3 c = texture(u_tex, uv).rgb + texture(u_head, uv).rgb;
  o = vec4(1.0 - exp(-c), 1.0);
}`;
