// ─── WebGL2 Render Engine — Full Build ───────────────────────────────────────
import { store } from '../core/store';
import { computeHomography, invertMat3 } from '../math/homography';
import { buildMeshGeometry } from '../math/mesh-warp';
import { EFFECT_DEF_MAP } from './effects/library';
import type { Layer, Surface, Effect } from '../core/types';
import {
  QUAD_VERT_GLSL, MESH_VERT_GLSL,
  WARP_FRAG_GLSL, MESH_FRAG_GLSL,
  BLIT_FRAG_GLSL, GRID_FRAG_GLSL,
  TESTCARD_FRAG_GLSL, MASK_FRAG_GLSL,
  EFFECT_VERT_GLSL, EDGE_BLEND_FRAG_GLSL,
  GENERATIVE_FRAG_TEMPLATE,
} from './shaders';

// ── GL helpers ────────────────────────────────────────────────────────────────

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile:\n${src.slice(0, 200)}\n---\n${info}`);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vSrc: string, fSrc: string): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fSrc);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vert);
  gl.attachShader(prog, frag);
  gl.linkProgram(prog);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(`Program link:\n${gl.getProgramInfoLog(prog)}`);
  return prog;
}

function makeQuadVAO(gl: WebGL2RenderingContext, prog: WebGLProgram): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  const buf = gl.createBuffer()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'position');
  if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
  gl.bindVertexArray(null);
  return vao;
}

function makeFBO(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex };
}

// ── Media registry ────────────────────────────────────────────────────────────

class MediaRegistry {
  private entries = new Map<string, {
    element?: HTMLVideoElement | HTMLImageElement;
    type: string; ready: boolean;
  }>();
  private cameraVideo: HTMLVideoElement | null = null;
  private cameraStream: MediaStream | null = null;

  async loadURL(id: string, url: string, type: 'video' | 'image') {
    if (type === 'video') {
      const vid = document.createElement('video');
      vid.src = url; vid.loop = true; vid.muted = true; vid.playsInline = true;
      vid.crossOrigin = 'anonymous';
      await vid.play().catch(() => {});
      this.entries.set(id, { element: vid, type: 'video', ready: true });
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => {
        img.onload = () => res(); img.onerror = () => rej(new Error('img load failed'));
        img.src = url;
      });
      this.entries.set(id, { element: img, type: 'image', ready: true });
    }
  }

  async startCamera(id: string) {
    if (!this.cameraStream) {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true });
      this.cameraVideo = document.createElement('video');
      this.cameraVideo.srcObject = this.cameraStream;
      this.cameraVideo.muted = true; this.cameraVideo.playsInline = true;
      await this.cameraVideo.play();
    }
    this.entries.set(id, { element: this.cameraVideo!, type: 'camera', ready: true });
  }

  setColor(id: string) { this.entries.set(id, { type: 'color', ready: true }); }

  getElement(id: string): HTMLVideoElement | HTMLImageElement | null {
    return (this.entries.get(id)?.element as any) ?? null;
  }

  getType(id: string): string { return this.entries.get(id)?.type ?? 'color'; }
  isReady(id: string): boolean { return this.entries.get(id)?.ready ?? false; }

  remove(id: string) {
    const e = this.entries.get(id);
    if (e?.type === 'video') (e.element as HTMLVideoElement)?.pause();
    this.entries.delete(id);
  }
}

// ── Generative shader canvas pool ─────────────────────────────────────────────

class GenerativePool {
  private pool = new Map<string, {
    canvas: OffscreenCanvas;
    gl: WebGL2RenderingContext;
    prog: WebGLProgram;
    vao: WebGLVertexArrayObject;
    startTime: number;
    lastCode: string;
  }>();

  render(id: string, code: string, width: number, height: number): OffscreenCanvas | null {
    let entry = this.pool.get(id);

    if (!entry || entry.lastCode !== code) {
      const canvas = new OffscreenCanvas(width, height);
      const gl = canvas.getContext('webgl2') as WebGL2RenderingContext;
      if (!gl) return null;
      let prog: WebGLProgram;
      try {
        prog = createProgram(gl, QUAD_VERT_GLSL, code);
      } catch {
        // fallback to template on error
        try { prog = createProgram(gl, QUAD_VERT_GLSL, GENERATIVE_FRAG_TEMPLATE); } catch { return null; }
      }
      const vao = makeQuadVAO(gl, prog);
      entry = { canvas, gl, prog, vao, startTime: performance.now() / 1000, lastCode: code };
      this.pool.set(id, entry);
    }

    const { gl, prog, vao } = entry;
    gl.canvas.width = width; gl.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);
    const t = performance.now() / 1000 - entry.startTime;
    const ul = (n: string) => gl.getUniformLocation(prog, n);
    gl.uniform1f(ul('uTime'), t);
    gl.uniform2f(ul('uResolution'), width, height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return entry.canvas;
  }
}

// ── Text canvas renderer ──────────────────────────────────────────────────────

function renderTextToCanvas(
  text: string,
  textColor = '#ffffff',
  textBg = 'transparent',
  fontSize = 64,
  fontFamily = 'Inter, sans-serif',
  width = 1024,
  height = 512
): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;

  // Background
  if (textBg && textBg !== 'transparent') {
    ctx.fillStyle = textBg;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }

  // Text styling
  ctx.fillStyle = textColor;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Word wrap for long text
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  const maxWidth = width * 0.88;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const measured = ctx.measureText(testLine);
    if (measured.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.3;
  const totalH = lines.length * lineHeight;
  const startY = (height - totalH) / 2 + lineHeight / 2;

  lines.forEach((line, i) => {
    ctx.fillText(line, width / 2, startY + i * lineHeight);
  });

  return canvas;
}

// ── Texture cache ─────────────────────────────────────────────────────────────

class TextureCache {
  private cache = new Map<string, WebGLTexture>();
  constructor(private gl: WebGL2RenderingContext) {}

  get(key: string): WebGLTexture {
    if (!this.cache.has(key)) {
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30,30,40,255]));
      this.cache.set(key, tex);
    }
    return this.cache.get(key)!;
  }

  upload(key: string, src: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.get(key));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  }

  delete(key: string) {
    const t = this.cache.get(key);
    if (t) { this.gl.deleteTexture(t); this.cache.delete(key); }
  }
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export class RenderEngine {
  canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  // Programs
  private warpProg!:     WebGLProgram;
  private meshProg!:     WebGLProgram;
  private blitProg!:     WebGLProgram;
  private gridProg!:     WebGLProgram;
  private testCardProg!: WebGLProgram;
  private maskProg!:     WebGLProgram;
  private blendProg!:    WebGLProgram;
  private edgeBlendProg!:WebGLProgram;

  // VAOs
  private quadVAO!: WebGLVertexArrayObject;
  private meshVAOs = new Map<string, { vao: WebGLVertexArrayObject; buf: WebGLBuffer; count: number }>();

  // Effect programs cache
  private effectProgs = new Map<string, WebGLProgram>();

  // FBOs for effects pipeline + compositing
  private fbo: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private fboB: { fbo: WebGLFramebuffer; tex: WebGLTexture } | null = null;
  private fboDim = { w: 0, h: 0 };

  private texCache: TextureCache;
  media: MediaRegistry;
  private genPool: GenerativePool;

  private rafId = 0;
  private running = false;
  private startTime = performance.now() / 1000;

  get time() { return performance.now() / 1000 - this.startTime; }

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not supported.');
    this.gl = gl;
    this.texCache  = new TextureCache(gl);
    this.media     = new MediaRegistry();
    this.genPool   = new GenerativePool();
    this.init();
  }

  private init() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.031, 0.031, 0.063, 1);

    this.warpProg     = createProgram(gl, QUAD_VERT_GLSL, WARP_FRAG_GLSL);
    this.meshProg     = createProgram(gl, MESH_VERT_GLSL, MESH_FRAG_GLSL);
    this.blitProg     = createProgram(gl, QUAD_VERT_GLSL, BLIT_FRAG_GLSL);
    this.gridProg     = createProgram(gl, QUAD_VERT_GLSL, GRID_FRAG_GLSL);
    this.testCardProg = createProgram(gl, QUAD_VERT_GLSL, TESTCARD_FRAG_GLSL);
    this.maskProg     = createProgram(gl, QUAD_VERT_GLSL, MASK_FRAG_GLSL);
    this.edgeBlendProg = createProgram(gl, QUAD_VERT_GLSL, EDGE_BLEND_FRAG_GLSL);

    this.quadVAO = makeQuadVAO(gl, this.warpProg);
  }

  // ── FBO management ─────────────────────────────────────────────────────────

  private ensureFBOs(w: number, h: number) {
    if (this.fboDim.w === w && this.fboDim.h === h) return;
    this.fbo  = makeFBO(this.gl, w, h);
    this.fboB = makeFBO(this.gl, w, h);
    this.fboDim = { w, h };
  }

  // ── Render loop ────────────────────────────────────────────────────────────

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => { if (!this.running) return; this.render(); this.rafId = requestAnimationFrame(loop); };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this.rafId); }

  resize(w: number, h: number) {
    this.canvas.width = w; this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
    // invalidate FBOs
    this.fboDim = { w: 0, h: 0 };
  }

  private render() {
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.ensureFBOs(W, H);

    // Blackout control
    if (store.ui.blackout) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }

    // Freeze frame control
    if (store.ui.freeze) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    // Render Input View canvas (left split)
    const inputCanvas = document.getElementById('input-canvas') as HTMLCanvasElement | null;
    if (inputCanvas) {
      if (inputCanvas.width !== W || inputCanvas.height !== H) {
        inputCanvas.width = W; inputCanvas.height = H;
      }
      const inCtx = inputCanvas.getContext('2d');
      if (inCtx) {
        inCtx.fillStyle = '#101014';
        inCtx.fillRect(0, 0, W, H);
        try { inCtx.drawImage(this.canvas, 0, 0); } catch {}
      }
    }

    for (const surface of store.project.surfaces) {
      if (!surface.visible) continue;
      const layers = store.getLayers(surface.id);
      for (const layer of layers) {
        if (!layer.visible) continue;
        this.renderLayer(surface, layer, W, H);
      }
    }

    if (store.ui.showGrid)     this.renderGrid();
    if (store.ui.showTestCard) this.renderTestCard();
  }

  private renderLayer(surface: Surface, layer: Layer, W: number, H: number) {
    const gl = this.gl;

    // 1. Upload media texture
    if (layer.source.type === 'text') {
      // Render text via Canvas2D → upload as texture every frame
      const src = layer.source;
      const offscreen = renderTextToCanvas(
        src.text ?? 'WebMapper Text',
        src.textColor ?? '#ffffff',
        src.textBg ?? 'transparent',
        src.textSize ?? 72,
        src.textFont ?? 'Inter, sans-serif',
        W, H
      );
      try { this.texCache.upload(layer.id, offscreen as unknown as TexImageSource); } catch {}
    } else if (layer.source.type !== 'color' && layer.source.type !== 'shader') {
      const el = this.media.getElement(layer.id);
      if (el) { try { this.texCache.upload(layer.id, el as TexImageSource); } catch {} }
    } else if (layer.source.type === 'shader') {
      const code = layer.source.shaderCode ?? GENERATIVE_FRAG_TEMPLATE;
      const offscreen = this.genPool.render(layer.id, code, W, H);
      if (offscreen) {
        try { this.texCache.upload(layer.id, offscreen as unknown as TexImageSource); } catch {}
      }
    }

    // 2. Render to FBO (for effects + masking)
    const hasFX = layer.effects.some((e) => e.enabled);
    const hasMask = surface.mask && surface.mask.length >= 3;

    if (hasFX || hasMask) {
      // Render surface to FBO A
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo!.fbo);
      gl.viewport(0, 0, W, H);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.drawSurface(surface, layer, W, H);

      // 3. Effects pipeline: ping-pong FBO A ↔ FBO B
      let srcTex = this.fbo!.tex;
      let dstFBO = this.fboB!.fbo;
      let dstTex = this.fboB!.tex;

      for (const effect of layer.effects) {
        if (!effect.enabled) continue;
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO);
        gl.viewport(0, 0, W, H);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.applyEffect(effect, srcTex, W, H);
        // swap
        [srcTex, dstTex] = [dstTex, srcTex];
        [dstFBO, ]       = [this.fbo!.fbo === dstFBO ? this.fboB!.fbo : this.fbo!.fbo, dstFBO];
      }

      // 4. Mask pass
      if (hasMask) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFBO === this.fbo!.fbo ? this.fboB!.fbo : this.fbo!.fbo);
        gl.viewport(0, 0, W, H);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.applyMask(srcTex, surface.mask!, W, H);
        srcTex = (dstFBO === this.fbo!.fbo ? this.fboB!.tex : this.fbo!.tex);
      }

      // 5. Blit to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      this.setBlendMode(layer.blendMode);
      gl.useProgram(this.blitProg);
      gl.bindVertexArray(this.quadVAO);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(this.blitProg, 'uTex'), 0);
      gl.uniform1f(gl.getUniformLocation(this.blitProg, 'uOpacity'), layer.opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      this.resetBlend();
    } else {
      // Direct to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      this.setBlendMode(layer.blendMode);
      this.drawSurface(surface, layer, W, H);
      this.resetBlend();
    }
  }

  private drawSurface(surface: Surface, layer: Layer, W: number, H: number) {
    const gl = this.gl;
    const isColor = layer.source.type === 'color';

    if (surface.type === 'mesh' && surface.meshGrid) {
      this.drawMesh(surface, layer, W, H);
    } else {
      // Quad homography warp
      const H3   = computeHomography(surface.points);
      const HInv = invertMat3(H3);

      gl.useProgram(this.warpProg);
      gl.bindVertexArray(this.quadVAO);
      const ul = (n: string) => gl.getUniformLocation(this.warpProg, n);
      gl.uniformMatrix3fv(ul('uHInv'), false, HInv);
      gl.uniform1f(ul('uOpacity'), layer.opacity);
      gl.uniform1i(ul('uIsColor'), isColor ? 1 : 0);
      if (isColor) {
        gl.uniform4fv(ul('uColorTint'), hexToVec4(layer.source.color ?? '#6366f1', layer.opacity));
      } else {
        const tex = this.texCache.get(layer.id);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(ul('uTexture'), 0);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }
  }

  private drawMesh(surface: Surface, layer: Layer, W: number, H: number) {
    const gl = this.gl;
    const { rows, cols } = surface.meshGrid!;
    const isColor = layer.source.type === 'color';

    // Build / update mesh VAO
    const key = surface.id;
    const geo = buildMeshGeometry(surface.points, rows, cols);
    let mesh = this.meshVAOs.get(key);
    if (!mesh) {
      const vao = gl.createVertexArray()!;
      const buf = gl.createBuffer()!;
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, geo, gl.DYNAMIC_DRAW);
      const posLoc = gl.getAttribLocation(this.meshProg, 'aPos');
      const uvLoc  = gl.getAttribLocation(this.meshProg, 'aUv');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc,  2, gl.FLOAT, false, 16, 8);
      gl.bindVertexArray(null);
      mesh = { vao, buf, count: geo.length / 4 };
      this.meshVAOs.set(key, mesh);
    } else {
      // Update geometry
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, geo);
      mesh.count = geo.length / 4;
    }

    gl.useProgram(this.meshProg);
    gl.bindVertexArray(mesh.vao);
    const ul = (n: string) => gl.getUniformLocation(this.meshProg, n);
    gl.uniform1f(ul('uOpacity'), layer.opacity);
    gl.uniform1i(ul('uIsColor'), isColor ? 1 : 0);
    if (isColor) {
      gl.uniform4fv(ul('uColorTint'), hexToVec4(layer.source.color ?? '#6366f1', layer.opacity));
    } else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texCache.get(layer.id));
      gl.uniform1i(ul('uTexture'), 0);
    }
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    gl.bindVertexArray(null);
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  private getEffectProg(type: string): WebGLProgram | null {
    if (!this.effectProgs.has(type)) {
      const def = EFFECT_DEF_MAP.get(type);
      if (!def) return null;
      try {
        const prog = createProgram(this.gl, EFFECT_VERT_GLSL, def.frag);
        // Rebuild VAO for this program
        this.effectProgs.set(type, prog);
      } catch (e) {
        console.error(`Effect '${type}' compile failed:`, e);
        return null;
      }
    }
    return this.effectProgs.get(type)!;
  }

  private applyEffect(effect: Effect, srcTex: WebGLTexture, W: number, H: number) {
    const gl = this.gl;
    const prog = this.getEffectProg(effect.type);
    if (!prog) return;

    gl.useProgram(prog);
    gl.bindVertexArray(this.quadVAO);
    const ul = (n: string) => gl.getUniformLocation(prog, n);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(ul('uTex'), 0);
    gl.uniform1f(ul('uTime'), this.time);
    gl.uniform2f(ul('uResolution'), W, H);

    const def = EFFECT_DEF_MAP.get(effect.type);
    if (def) {
      for (const [name, meta] of Object.entries(def.params)) {
        const v = effect.params[name] ?? meta.default;
        gl.uniform1f(ul(name), v);
      }
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ── Mask ───────────────────────────────────────────────────────────────────

  private applyMask(srcTex: WebGLTexture, poly: { x: number; y: number }[], W: number, H: number) {
    const gl = this.gl;
    gl.useProgram(this.maskProg);
    gl.bindVertexArray(this.quadVAO);
    const ul = (n: string) => gl.getUniformLocation(this.maskProg, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(ul('uTex'), 0);
    const pts = new Float32Array(64 * 2);
    const n = Math.min(poly.length, 64);
    for (let i = 0; i < n; i++) { pts[i * 2] = poly[i].x; pts[i * 2 + 1] = poly[i].y; }
    gl.uniform2fv(ul('uPoly'), pts);
    gl.uniform1i(ul('uPolyN'), n);
    gl.uniform1f(ul('uFeather'), 0.3);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  // ── Overlays ───────────────────────────────────────────────────────────────

  private renderGrid() {
    const gl = this.gl;
    gl.useProgram(this.gridProg);
    gl.bindVertexArray(this.quadVAO);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uGridSize'), 16);
    gl.uniform1f(gl.getUniformLocation(this.gridProg, 'uLineWidth'), 0.015);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private renderTestCard() {
    const gl = this.gl;
    gl.useProgram(this.testCardProg);
    gl.bindVertexArray(this.quadVAO);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    this.resetBlend();
  }

  // ── Blend modes ────────────────────────────────────────────────────────────

  private setBlendMode(mode: string) {
    const gl = this.gl;
    gl.blendEquation(gl.FUNC_ADD);
    switch (mode) {
      case 'add':      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); break;
      case 'multiply': gl.blendFunc(gl.DST_COLOR, gl.ZERO); break;
      case 'screen':   gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); break;
      case 'subtract':
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
        break;
      default:         gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); break;
    }
  }

  private resetBlend() {
    const gl = this.gl;
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async loadMediaForLayer(layerId: string) {
    const layer = store.project.layers.find((l) => l.id === layerId);
    if (!layer) return;
    const { source } = layer;
    if (source.type === 'video'  && source.url)    await this.media.loadURL(layerId, source.url, 'video');
    else if (source.type === 'image' && source.url) await this.media.loadURL(layerId, source.url, 'image');
    else if (source.type === 'camera')              await this.media.startCamera(layerId);
    else if (source.type === 'text')                this.media.setColor(layerId); // placeholder — real render happens in renderLayer
    else                                            this.media.setColor(layerId);
  }

  async loadAllMedia() {
    for (const layer of store.project.layers) await this.loadMediaForLayer(layer.id);
  }

  requestFullscreen() { this.canvas.requestFullscreen?.(); }

  /** Capture the current frame as a base64 JPEG for scene thumbnails. */
  captureFrame(quality = 0.5): string { return this.canvas.toDataURL('image/jpeg', quality); }

  invalidateMeshVAO(surfaceId: string) { this.meshVAOs.delete(surfaceId); }

  dispose() {
    this.stop();
    const gl = this.gl;
    [this.warpProg, this.meshProg, this.blitProg, this.gridProg,
     this.testCardProg, this.maskProg, this.edgeBlendProg].forEach((p) => gl.deleteProgram(p));
    this.effectProgs.forEach((p) => gl.deleteProgram(p));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToVec4(hex: string, alpha = 1): Float32Array {
  if (hex.length < 7) hex = '#6366f1';
  return new Float32Array([
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
    alpha,
  ]);
}
