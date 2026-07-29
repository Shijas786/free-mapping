// ─── Effects Engine — GLSL per-layer post-processing ─────────────────────────

export interface EffectDef {
  type: string;
  label: string;
  category: 'color' | 'distortion' | 'generative' | 'blur' | 'stylize';
  params: Record<string, { label: string; min: number; max: number; default: number; step?: number }>;
  frag: string;
}

// Shared header injected before every effect frag shader
const HDR = /* glsl */`#version 300 es
precision highp float;
in  vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform float uTime;
`;

// ── Keying & Masking effects ──────────────────────────────────────────────────

const CHROMA_KEY: EffectDef = {
  type: 'chroma-key', label: 'Chroma Key (Green/Blue Screen)', category: 'color',
  params: {
    keyHue: { label: 'Key Hue', min: 0, max: 360, default: 120, step: 1 }, // default 120 green
    tolerance: { label: 'Tolerance', min: 0.01, max: 0.5, default: 0.2, step: 0.01 },
    softness: { label: 'Softness', min: 0.0, max: 0.5, default: 0.1, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float keyHue; uniform float tolerance; uniform float softness;
vec3 rgb2hsl_k(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b)), minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5, s = 0.0, h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h * 360.0, s, l);
}
void main() {
  vec4 col = texture(uTex, vUv);
  vec3 hsl = rgb2hsl_k(col.rgb);
  float diff = abs(hsl.x - keyHue);
  if (diff > 180.0) diff = 360.0 - diff;
  float alpha = smoothstep(tolerance, tolerance + max(softness, 0.001), diff / 180.0 * 3.14159);
  fragColor = vec4(col.rgb, col.a * alpha);
}`,
};

const LUMA_KEY: EffectDef = {
  type: 'luma-key', label: 'Luma Key (Luminance Mask)', category: 'color',
  params: {
    threshold: { label: 'Threshold', min: 0, max: 1, default: 0.1, step: 0.01 },
    invert: { label: 'Invert', min: 0, max: 1, default: 0, step: 1 },
  },
  frag: HDR + /* glsl */`
uniform float threshold; uniform float invert;
void main() {
  vec4 col = texture(uTex, vUv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  float alpha = step(threshold, lum);
  if (invert > 0.5) alpha = 1.0 - alpha;
  fragColor = vec4(col.rgb, col.a * alpha);
}`,
};

// ── Color effects ─────────────────────────────────────────────────────────────

const HUE_SHIFT: EffectDef = {
  type: 'hue-shift', label: 'Hue Shift', category: 'color',
  params: {
    amount: { label: 'Amount', min: -180, max: 180, default: 0, step: 1 },
    saturation: { label: 'Saturation', min: 0, max: 3, default: 1, step: 0.01 },
    lightness: { label: 'Lightness', min: -1, max: 1, default: 0, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float amount;
uniform float saturation;
uniform float lightness;

vec3 hsl2rgb(vec3 c) {
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0);
  return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0*c.z - 1.0));
}
vec3 rgb2hsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float s = 0.0, h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
void main() {
  vec4 col = texture(uTex, vUv);
  vec3 hsl = rgb2hsl(col.rgb);
  hsl.x = fract(hsl.x + amount / 360.0);
  hsl.y = clamp(hsl.y * saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + lightness,  0.0, 1.0);
  fragColor = vec4(hsl2rgb(hsl), col.a);
}`,
};

const BRIGHTNESS_CONTRAST: EffectDef = {
  type: 'brightness-contrast', label: 'Brightness / Contrast', category: 'color',
  params: {
    brightness: { label: 'Brightness', min: -1, max: 1, default: 0, step: 0.01 },
    contrast: { label: 'Contrast', min: -1, max: 1, default: 0, step: 0.01 },
    gamma: { label: 'Gamma', min: 0.1, max: 4, default: 1, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float brightness; uniform float contrast; uniform float gamma;
void main() {
  vec4 col = texture(uTex, vUv);
  vec3 rgb = col.rgb;
  rgb += brightness;
  rgb = (rgb - 0.5) * (1.0 + contrast) + 0.5;
  rgb = pow(max(rgb, vec3(0.0)), vec3(1.0 / max(gamma, 0.01)));
  fragColor = vec4(clamp(rgb, 0.0, 1.0), col.a);
}`,
};

const INVERT: EffectDef = {
  type: 'invert', label: 'Invert', category: 'color',
  params: { amount: { label: 'Amount', min: 0, max: 1, default: 1, step: 0.01 } },
  frag: HDR + /* glsl */`
uniform float amount;
void main() {
  vec4 col = texture(uTex, vUv);
  fragColor = vec4(mix(col.rgb, 1.0 - col.rgb, amount), col.a);
}`,
};

const POSTERIZE: EffectDef = {
  type: 'posterize', label: 'Posterize', category: 'color',
  params: { levels: { label: 'Levels', min: 2, max: 16, default: 4, step: 1 } },
  frag: HDR + /* glsl */`
uniform float levels;
void main() {
  vec4 col = texture(uTex, vUv);
  fragColor = vec4(floor(col.rgb * levels + 0.5) / levels, col.a);
}`,
};

const THRESHOLD: EffectDef = {
  type: 'threshold', label: 'Threshold', category: 'color',
  params: { threshold: { label: 'Threshold', min: 0, max: 1, default: 0.5, step: 0.01 } },
  frag: HDR + /* glsl */`
uniform float threshold;
void main() {
  vec4 col = texture(uTex, vUv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  fragColor = vec4(vec3(step(threshold, lum)), col.a);
}`,
};

// ── Distortion effects ────────────────────────────────────────────────────────

const PIXELATE: EffectDef = {
  type: 'pixelate', label: 'Pixelate', category: 'distortion',
  params: { size: { label: 'Pixel Size', min: 1, max: 128, default: 8, step: 1 } },
  frag: HDR + /* glsl */`
uniform float size;
uniform vec2 uResolution;
void main() {
  vec2 ps = size / uResolution;
  vec2 snapped = floor(vUv / ps) * ps + ps * 0.5;
  fragColor = texture(uTex, snapped);
}`,
};

const CHROMATIC_ABERRATION: EffectDef = {
  type: 'chromatic-aberration', label: 'Chromatic Aberration', category: 'distortion',
  params: {
    strength: { label: 'Strength', min: 0, max: 0.05, default: 0.005, step: 0.0005 },
    angle: { label: 'Angle', min: 0, max: 360, default: 0, step: 1 },
  },
  frag: HDR + /* glsl */`
uniform float strength; uniform float angle;
void main() {
  vec2 dir = vec2(cos(radians(angle)), sin(radians(angle))) * strength;
  float r = texture(uTex, vUv + dir).r;
  float g = texture(uTex, vUv).g;
  float b = texture(uTex, vUv - dir).b;
  float a = texture(uTex, vUv).a;
  fragColor = vec4(r, g, b, a);
}`,
};

const DISPLACEMENT: EffectDef = {
  type: 'displacement', label: 'Displacement / Wave', category: 'distortion',
  params: {
    amplitudeX: { label: 'Amplitude X', min: 0, max: 0.2, default: 0.02, step: 0.001 },
    amplitudeY: { label: 'Amplitude Y', min: 0, max: 0.2, default: 0.02, step: 0.001 },
    freqX: { label: 'Frequency X', min: 1, max: 40, default: 10, step: 0.5 },
    freqY: { label: 'Frequency Y', min: 1, max: 40, default: 10, step: 0.5 },
    speed: { label: 'Speed', min: 0, max: 5, default: 1, step: 0.1 },
  },
  frag: HDR + /* glsl */`
uniform float amplitudeX; uniform float amplitudeY;
uniform float freqX; uniform float freqY; uniform float speed;
void main() {
  float dx = sin(vUv.y * freqY * 6.2832 + uTime * speed) * amplitudeX;
  float dy = cos(vUv.x * freqX * 6.2832 + uTime * speed) * amplitudeY;
  fragColor = texture(uTex, fract(vUv + vec2(dx, dy)));
}`,
};

const KALEIDOSCOPE: EffectDef = {
  type: 'kaleidoscope', label: 'Kaleidoscope', category: 'distortion',
  params: {
    segments: { label: 'Segments', min: 2, max: 32, default: 6, step: 1 },
    rotation: { label: 'Rotation', min: 0, max: 360, default: 0, step: 1 },
    zoom: { label: 'Zoom', min: 0.1, max: 4, default: 1, step: 0.05 },
  },
  frag: HDR + /* glsl */`
uniform float segments; uniform float rotation; uniform float zoom;
#define PI 3.14159265359
void main() {
  vec2 p = vUv - 0.5;
  float angle = atan(p.y, p.x) + radians(rotation);
  float len = length(p) * zoom;
  float seg = PI / segments;
  angle = mod(angle, 2.0 * seg);
  if (angle > seg) angle = 2.0 * seg - angle;
  vec2 q = vec2(cos(angle), sin(angle)) * len + 0.5;
  fragColor = texture(uTex, q);
}`,
};

const MIRROR: EffectDef = {
  type: 'mirror', label: 'Mirror', category: 'distortion',
  params: {
    horizontal: { label: 'Horizontal', min: 0, max: 1, default: 1, step: 1 },
    vertical: { label: 'Vertical', min: 0, max: 1, default: 0, step: 1 },
  },
  frag: HDR + /* glsl */`
uniform float horizontal; uniform float vertical;
void main() {
  vec2 uv = vUv;
  if (horizontal > 0.5 && uv.x > 0.5) uv.x = 1.0 - uv.x;
  if (vertical   > 0.5 && uv.y > 0.5) uv.y = 1.0 - uv.y;
  fragColor = texture(uTex, uv);
}`,
};

const ZOOM_ROTATE: EffectDef = {
  type: 'zoom-rotate', label: 'Zoom / Rotate', category: 'distortion',
  params: {
    zoom: { label: 'Zoom', min: 0.1, max: 5, default: 1, step: 0.01 },
    rotation: { label: 'Rotation', min: -180, max: 180, default: 0, step: 0.5 },
    pivotX: { label: 'Pivot X', min: 0, max: 1, default: 0.5, step: 0.01 },
    pivotY: { label: 'Pivot Y', min: 0, max: 1, default: 0.5, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float zoom; uniform float rotation; uniform float pivotX; uniform float pivotY;
void main() {
  vec2 p = vUv - vec2(pivotX, pivotY);
  float c = cos(radians(rotation)); float s = sin(radians(rotation));
  p = mat2(c,-s,s,c) * p / zoom;
  fragColor = texture(uTex, fract(p + vec2(pivotX, pivotY)));
}`,
};

// ── Blur / stylize effects ────────────────────────────────────────────────────

const GAUSSIAN_BLUR: EffectDef = {
  type: 'gaussian-blur', label: 'Gaussian Blur', category: 'blur',
  params: { radius: { label: 'Radius', min: 0, max: 20, default: 2, step: 0.5 } },
  frag: HDR + /* glsl */`
uniform float radius;
uniform vec2 uResolution;
void main() {
  vec4 col = vec4(0.0);
  float total = 0.0;
  float r = radius;
  for (float x = -r; x <= r; x++) {
    for (float y = -r; y <= r; y++) {
      float w = exp(-(x*x + y*y) / (2.0*r*r + 0.001));
      col += texture(uTex, vUv + vec2(x,y) / uResolution) * w;
      total += w;
    }
  }
  fragColor = col / total;
}`,
};

const EDGE_GLOW: EffectDef = {
  type: 'edge-glow', label: 'Edge Glow / Sobel', category: 'stylize',
  params: {
    strength: { label: 'Strength', min: 0, max: 5, default: 1, step: 0.1 },
    glowColor: { label: 'Glow Hue', min: 0, max: 360, default: 200, step: 1 },
    mix: { label: 'Mix', min: 0, max: 1, default: 0.8, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float strength; uniform float glowColor; uniform float mix;
uniform vec2 uResolution;
vec3 hue2rgb(float h) { return clamp(abs(mod(h/60.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); }
void main() {
  vec2 px = 1.0 / uResolution;
  float tl = dot(texture(uTex, vUv + vec2(-1,-1)*px).rgb, vec3(0.299,0.587,0.114));
  float t  = dot(texture(uTex, vUv + vec2( 0,-1)*px).rgb, vec3(0.299,0.587,0.114));
  float tr = dot(texture(uTex, vUv + vec2( 1,-1)*px).rgb, vec3(0.299,0.587,0.114));
  float l  = dot(texture(uTex, vUv + vec2(-1, 0)*px).rgb, vec3(0.299,0.587,0.114));
  float r  = dot(texture(uTex, vUv + vec2( 1, 0)*px).rgb, vec3(0.299,0.587,0.114));
  float bl = dot(texture(uTex, vUv + vec2(-1, 1)*px).rgb, vec3(0.299,0.587,0.114));
  float b  = dot(texture(uTex, vUv + vec2( 0, 1)*px).rgb, vec3(0.299,0.587,0.114));
  float br = dot(texture(uTex, vUv + vec2( 1, 1)*px).rgb, vec3(0.299,0.587,0.114));
  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = clamp(length(vec2(gx,gy)) * strength, 0.0, 1.0);
  vec4 src = texture(uTex, vUv);
  fragColor = vec4(src.rgb + hue2rgb(glowColor) * edge * mix, src.a);
}`,
};

const GLITCH: EffectDef = {
  type: 'glitch', label: 'Glitch', category: 'stylize',
  params: {
    amount: { label: 'Amount', min: 0, max: 1, default: 0.3, step: 0.01 },
    speed: { label: 'Speed', min: 0, max: 10, default: 3, step: 0.1 },
    blockSize: { label: 'Block Size', min: 0.01, max: 0.5, default: 0.1, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float amount; uniform float speed; uniform float blockSize;
float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453); }
void main() {
  float t = floor(uTime * speed);
  float block = floor(vUv.y / blockSize);
  float r = rand(vec2(block, t));
  float shift = (r - 0.5) * amount;
  if (r < amount * 0.3) {
    float r2 = texture(uTex, vUv + vec2(shift * 0.03, 0.0)).r;
    float g2 = texture(uTex, vUv).g;
    float b2 = texture(uTex, vUv - vec2(shift * 0.03, 0.0)).b;
    fragColor = vec4(r2, g2, b2, 1.0);
  } else {
    fragColor = texture(uTex, vUv + vec2(shift * 0.01, 0.0));
  }
}`,
};

const VIGNETTE: EffectDef = {
  type: 'vignette', label: 'Vignette', category: 'stylize',
  params: {
    strength: { label: 'Strength', min: 0, max: 2, default: 0.5, step: 0.01 },
    radius: { label: 'Radius', min: 0.1, max: 2, default: 0.8, step: 0.01 },
    softness: { label: 'Softness', min: 0.01, max: 1, default: 0.4, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float strength; uniform float radius; uniform float softness;
void main() {
  vec4 col = texture(uTex, vUv);
  vec2 p = vUv - 0.5;
  float d = length(p);
  float vig = 1.0 - smoothstep(radius - softness, radius + softness, d) * strength;
  fragColor = vec4(col.rgb * vig, col.a);
}`,
};

const SCANLINES: EffectDef = {
  type: 'scanlines', label: 'Scanlines', category: 'stylize',
  params: {
    count: { label: 'Line Count', min: 20, max: 600, default: 120, step: 5 },
    intensity: { label: 'Intensity', min: 0, max: 1, default: 0.4, step: 0.01 },
    speed: { label: 'Scroll Speed', min: 0, max: 5, default: 0, step: 0.1 },
  },
  frag: HDR + /* glsl */`
uniform float count; uniform float intensity; uniform float speed;
void main() {
  vec4 col = texture(uTex, vUv);
  float line = mod((vUv.y + uTime * speed * 0.01) * count, 1.0);
  float mask = smoothstep(0.45, 0.5, line) * (1.0 - smoothstep(0.5, 0.55, line));
  fragColor = vec4(col.rgb * (1.0 - mask * intensity), col.a);
}`,
};

const COLOR_GRADING: EffectDef = {
  type: 'color-grading', label: 'Color Grading (Shadows/Mids/Highlights)', category: 'color',
  params: {
    shadowR: { label: 'Shadow R', min: -1, max: 1, default: 0, step: 0.01 },
    shadowB: { label: 'Shadow B', min: -1, max: 1, default: 0, step: 0.01 },
    midR:    { label: 'Mid R',    min: -1, max: 1, default: 0, step: 0.01 },
    midG:    { label: 'Mid G',    min: -1, max: 1, default: 0, step: 0.01 },
    hiR:     { label: 'High R',   min: -1, max: 1, default: 0, step: 0.01 },
    hiB:     { label: 'High B',   min: -1, max: 1, default: 0, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float shadowR; uniform float shadowB; uniform float midR; uniform float midG; uniform float hiR; uniform float hiB;
void main() {
  vec4 col = texture(uTex, vUv);
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  float shadow = 1.0 - smoothstep(0.0, 0.4, lum);
  float hi     = smoothstep(0.6, 1.0, lum);
  float mid    = 1.0 - shadow - hi;
  vec3 grade   = col.rgb;
  grade.r += shadow*shadowR + mid*midR + hi*hiR;
  grade.g += mid*midG;
  grade.b += shadow*shadowB + hi*hiB;
  fragColor = vec4(clamp(grade, 0.0, 1.0), col.a);
}`,
};

// ── Generative shaders ────────────────────────────────────────────────────────

const NOISE_FIELD: EffectDef = {
  type: 'noise-field', label: 'Noise Field', category: 'generative',
  params: {
    scale: { label: 'Scale', min: 1, max: 30, default: 6, step: 0.5 },
    speed: { label: 'Speed', min: 0, max: 3, default: 0.5, step: 0.05 },
    brightness: { label: 'Brightness', min: 0, max: 2, default: 1, step: 0.01 },
    colorMix: { label: 'Color Mix', min: 0, max: 1, default: 0.7, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float scale; uniform float speed; uniform float brightness; uniform float colorMix;
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x_ = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x_) - 0.5;
  vec3 ox = floor(x_ + 0.5);
  vec3 a0 = x_ - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
void main() {
  vec4 src = texture(uTex, vUv);
  float n = snoise(vUv * scale + vec2(uTime * speed));
  n = n * 0.5 + 0.5;
  vec3 baseColor = vec3(n * 0.4, n * 0.2, n);
  vec3 result = mix(src.rgb, baseColor * brightness, colorMix);
  fragColor = vec4(result, src.a);
}`,
};

const PLASMA: EffectDef = {
  type: 'plasma', label: 'Plasma', category: 'generative',
  params: {
    speed: { label: 'Speed', min: 0, max: 3, default: 0.5, step: 0.05 },
    scale: { label: 'Scale', min: 0.5, max: 10, default: 2, step: 0.1 },
    colorShift: { label: 'Color Shift', min: 0, max: 360, default: 0, step: 1 },
    mix: { label: 'Mix', min: 0, max: 1, default: 0.6, step: 0.01 },
  },
  frag: HDR + /* glsl */`
uniform float speed; uniform float scale; uniform float colorShift; uniform float mix;
vec3 hue(float h){return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0);}
void main() {
  vec4 src = texture(uTex, vUv);
  float t = uTime * speed;
  vec2 p = vUv * scale;
  float v1 = sin(p.x + t);
  float v2 = sin(p.y + t);
  float v3 = sin(p.x + p.y + t);
  float v4 = sin(sqrt(p.x*p.x + p.y*p.y) + t);
  float v = (v1+v2+v3+v4) / 4.0 * 0.5 + 0.5;
  vec3 plasma = hue(v + colorShift/360.0);
  fragColor = vec4(mix(src.rgb, plasma, mix), src.a);
}`,
};

// ── Registry ──────────────────────────────────────────────────────────────────

export const EFFECT_DEFS: EffectDef[] = [
  CHROMA_KEY, LUMA_KEY,
  HUE_SHIFT, BRIGHTNESS_CONTRAST, INVERT, POSTERIZE, THRESHOLD, COLOR_GRADING,
  PIXELATE, CHROMATIC_ABERRATION, DISPLACEMENT, KALEIDOSCOPE, MIRROR, ZOOM_ROTATE,
  GAUSSIAN_BLUR,
  EDGE_GLOW, GLITCH, VIGNETTE, SCANLINES,
  NOISE_FIELD, PLASMA,
];

export const EFFECT_DEF_MAP = new Map<string, EffectDef>(
  EFFECT_DEFS.map((d) => [d.type, d])
);

export type { EffectDef as EffectDefinition };
