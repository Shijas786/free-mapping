// ─── GLSL Shader Sources ──────────────────────────────────────────────────────

/** Pass-through vertex shader for full-screen quad (clips space). */
export const QUAD_VERT_GLSL = /* glsl */`#version 300 es
precision highp float;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/** Mesh vertex shader — position + UV from VBO, no matrix needed. */
export const MESH_VERT_GLSL = /* glsl */`#version 300 es
precision highp float;
in vec2 aPos;   // normalised stage position [0,1]
in vec2 aUv;    // source texture UV [0,1]
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
  // Flip Y: WebGL clip-space has Y up, but our aPos has Y down
  gl_Position.y = -gl_Position.y;
}`;

/** Homography-warp frag for quad surfaces (full-screen with H-inverse). */
export const WARP_FRAG_GLSL = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform mat3      uHInv;
uniform float     uOpacity;
uniform vec4      uColorTint;
uniform bool      uIsColor;
void main() {
  if (uIsColor) { fragColor = uColorTint * uOpacity; return; }
  vec3 hc = uHInv * vec3(vUv, 1.0);
  vec2 uv = hc.xy / hc.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  fragColor = texture(uTexture, uv) * uOpacity;
}`;

/** Mesh frag — simple texture sample, UVs come from vertex shader. */
export const MESH_FRAG_GLSL = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float     uOpacity;
uniform vec4      uColorTint;
uniform bool      uIsColor;
void main() {
  if (uIsColor) { fragColor = uColorTint * uOpacity; return; }
  fragColor = texture(uTexture, vUv) * uOpacity;
}`;

/** Full-screen blit (copy one texture to screen). */
export const BLIT_FRAG_GLSL = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float     uOpacity;
void main() { fragColor = texture(uTex, vUv) * uOpacity; }`;

/** Grid overlay. */
export const GRID_FRAG_GLSL = /* glsl */`#version 300 es
precision mediump float;
in  vec2 vUv;
out vec4 fragColor;
uniform float uGridSize;
uniform float uLineWidth;
void main() {
  vec2 cell = fract(vUv * uGridSize);
  float lx = step(1.0 - uLineWidth, cell.x) + step(cell.x, uLineWidth);
  float ly = step(1.0 - uLineWidth, cell.y) + step(cell.y, uLineWidth);
  float line = clamp(lx + ly, 0.0, 1.0);
  fragColor = vec4(1.0, 1.0, 1.0, line * 0.3);
}`;

/** Test card — SMPTE color bars. */
export const TESTCARD_FRAG_GLSL = /* glsl */`#version 300 es
precision mediump float;
in  vec2 vUv;
out vec4 fragColor;
vec3 colorBar(float t) {
  if (t < 1.0/7.0) return vec3(1,1,1);
  if (t < 2.0/7.0) return vec3(1,1,0);
  if (t < 3.0/7.0) return vec3(0,1,1);
  if (t < 4.0/7.0) return vec3(0,1,0);
  if (t < 5.0/7.0) return vec3(1,0,1);
  if (t < 6.0/7.0) return vec3(1,0,0);
  return vec3(0,0,1);
}
void main() {
  vec3 col = colorBar(vUv.x);
  float cx = abs(vUv.x - 0.5); float cy = abs(vUv.y - 0.5);
  if (cx < 0.002 || cy < 0.002) col = vec3(1.0);
  if (vUv.x<0.005||vUv.x>0.995||vUv.y<0.005||vUv.y>0.995) col = vec3(1.0);
  fragColor = vec4(col, 1.0);
}`;

/** Polygon mask: stencil via SDF of polygon. */
export const MASK_FRAG_GLSL = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2  uPoly[64];
uniform int   uPolyN;
uniform float uFeather;
// Point-in-polygon test (winding number)
float pip(vec2 p) {
  float inside = 0.0;
  for (int i = 0; i < uPolyN; i++) {
    vec2 a = uPoly[i];
    vec2 b = uPoly[(i + 1) % uPolyN];
    if ((a.y <= p.y && b.y > p.y) || (b.y <= p.y && a.y > p.y)) {
      float t = (p.y - a.y) / (b.y - a.y);
      if (p.x < a.x + t * (b.x - a.x)) inside = 1.0 - inside;
    }
  }
  return inside;
}
void main() {
  float mask = pip(vUv);
  if (uFeather > 0.0) {
    // simple feather via neighbouring samples
    float sum = mask;
    float step = uFeather * 0.02;
    sum += pip(vUv + vec2( step,  0));
    sum += pip(vUv + vec2(-step,  0));
    sum += pip(vUv + vec2( 0,  step));
    sum += pip(vUv + vec2( 0, -step));
    mask = sum / 5.0;
  }
  vec4 col = texture(uTex, vUv);
  fragColor = vec4(col.rgb, col.a * mask);
}`;

/** Effect pass vertex (same as quad vert but not flipping Y — FBO coords). */
export const EFFECT_VERT_GLSL = /* glsl */`#version 300 es
precision highp float;
in  vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/** Generic generative content source (user-editable GLSL). */
export const GENERATIVE_FRAG_TEMPLATE = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform float uTime;
uniform vec2  uResolution;

// ── Your code here ──────────────────────────────────────────────────────────
void main() {
  vec2 uv = vUv;
  float t = uTime;
  // Default: animated gradient
  vec3 col = 0.5 + 0.5 * cos(t + uv.xyx + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(col, 1.0);
}`;

/** Edge-blending gradient for multi-projector overlap zones. */
export const EDGE_BLEND_FRAG_GLSL = /* glsl */`#version 300 es
precision mediump float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uLeft;   // blend zone widths [0,1]
uniform float uRight;
uniform float uTop;
uniform float uBottom;
uniform float uGamma;
void main() {
  float fade = 1.0;
  if (vUv.x < uLeft)   fade = min(fade, pow(vUv.x / max(uLeft,0.001), uGamma));
  if (vUv.x > 1.0-uRight)  fade = min(fade, pow((1.0-vUv.x)/max(uRight,0.001),uGamma));
  if (vUv.y < uTop)    fade = min(fade, pow(vUv.y / max(uTop,0.001),   uGamma));
  if (vUv.y > 1.0-uBottom) fade = min(fade, pow((1.0-vUv.y)/max(uBottom,0.001),uGamma));
  fragColor = texture(uTex, vUv) * vec4(vec3(1.0), fade);
}`;
