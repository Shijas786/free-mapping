// ─── Shader Editor — generative GLSL source editing ──────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { GENERATIVE_FRAG_TEMPLATE } from '../render/shaders';

export class ShaderEditor {
  private el: HTMLElement | null = null;
  private compileTimeout = 0;

  constructor() {
    this.el = document.getElementById('shader-editor-panel');
    if (!this.el) return;
    this.render();
    store.bus.on('LAYER_UPDATED',    () => this.render());
    store.bus.on('UI_STATE_CHANGED', () => this.render());
  }

  private render() {
    if (!this.el) return;
    const layerId = store.ui.selectedLayerId;
    const layer   = layerId ? store.project.layers.find((l) => l.id === layerId) : null;
    const isShader = layer?.source.type === 'shader';

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Shader Editor</span>
        ${layer ? `<button class="icon-btn" id="btn-set-shader" title="Set as shader source" ${isShader ? 'style="color:var(--clr-accent-2)"' : ''}>⚡</button>` : ''}
      </div>

      ${!layer ? `<div class="panel-empty"><p>Select a layer to edit shaders</p></div>` : `

      ${!isShader ? `
        <div class="panel-empty" style="padding:16px">
          <div class="cs-icon">⚡</div>
          <p>Click <strong>⚡</strong> to set this layer to generative shader mode.</p>
        </div>
      ` : `
        <div class="shader-editor-wrap">
          <textarea id="shader-code" class="shader-code" spellcheck="false">${layer.source.shaderCode ?? GENERATIVE_FRAG_TEMPLATE}</textarea>
          <div class="shader-toolbar">
            <button class="tb-btn" id="btn-compile">▶ Apply</button>
            <button class="tb-btn" id="btn-reset-shader">↺ Reset</button>
            <span id="shader-status" class="shader-status ok">●  OK</span>
          </div>
          <div class="shader-ref">
            <div class="props-label">Available Uniforms</div>
            <ul class="shader-uniform-list">
              <li><code>uniform float uTime;</code> — time in seconds</li>
              <li><code>uniform vec2 uResolution;</code> — canvas size</li>
              <li><code>in vec2 vUv;</code> — fragment UV [0,1]</li>
              <li><code>out vec4 fragColor;</code> — output colour</li>
            </ul>
          </div>
        </div>
      `}
      `}
    `;

    document.getElementById('btn-set-shader')?.addEventListener('click', () => {
      if (!layer) return;
      const code = layer.source.shaderCode ?? GENERATIVE_FRAG_TEMPLATE;
      store.updateLayer({ ...layer, source: { type: 'shader', shaderCode: code } });
    });

    const textarea = document.getElementById('shader-code') as HTMLTextAreaElement | null;

    document.getElementById('btn-compile')?.addEventListener('click', () => {
      if (!layer || !textarea) return;
      history.push(store.project);
      store.updateLayer({ ...layer, source: { type: 'shader', shaderCode: textarea.value } });
      const st = document.getElementById('shader-status')!;
      st.textContent = '●  Applied'; st.className = 'shader-status ok';
    });

    document.getElementById('btn-reset-shader')?.addEventListener('click', () => {
      if (!textarea) return;
      textarea.value = GENERATIVE_FRAG_TEMPLATE;
    });

    // Auto-compile on pause
    textarea?.addEventListener('input', () => {
      clearTimeout(this.compileTimeout);
      const st = document.getElementById('shader-status');
      if (st) { st.textContent = '● Editing…'; st.className = 'shader-status pending'; }
      this.compileTimeout = window.setTimeout(() => {
        if (!layer || !textarea) return;
        store.updateLayer({ ...layer, source: { type: 'shader', shaderCode: textarea.value } });
        if (st) { st.textContent = '●  Applied'; st.className = 'shader-status ok'; }
      }, 1200);
    });
  }
}
