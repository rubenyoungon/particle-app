// WebGL2 context and helpers for building shader programs.

export const canvas = document.getElementById('c');
export const gl = canvas.getContext('webgl2', {
  antialias: false, alpha: false, depth: false, stencil: false,
  premultipliedAlpha: false, powerPreference: 'high-performance',
});

export function fail(msg) {
  const el = document.getElementById('error');
  el.textContent = msg; el.style.display = 'grid';
  throw new Error(msg);
}

if (!gl) fail('This browser does not support WebGL2.');
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('EXT_color_buffer_half_float');
canvas.addEventListener('webglcontextlost', e => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) fail('Shader error:\n' + gl.getShaderInfoLog(s));
  return s;
}

// Returns { p: the program, u: { uniformName: location } }.
export function program(vs, fs, varyings) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) fail('Link error:\n' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}
