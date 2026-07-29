// ─── Layer Panel ──────────────────────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { generateId } from '../core/utils';
import type { Layer, BlendMode } from '../core/types';
import type { RenderEngine } from '../render/engine';

const BLEND_MODES: BlendMode[] = ['normal', 'add', 'multiply', 'screen', 'subtract'];

export class LayerPanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('layer-panel')!;
    if (!this.el) return;
    this.render();

    store.bus.on('LAYER_ADDED',     () => this.render());
    store.bus.on('LAYER_REMOVED',   () => this.render());
    store.bus.on('LAYER_UPDATED',   () => this.render());
    store.bus.on('PROJECT_LOADED',  () => this.render());
    store.bus.on('UI_STATE_CHANGED', () => this.render());
  }

  private render() {
    const surfaceId = store.ui.selectedSurfaceId;
    const surface   = surfaceId ? store.getSurface(surfaceId) : null;
    const layers    = surfaceId ? store.getLayers(surfaceId) : [];

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Layers${surface ? ` — ${surface.name}` : ''}</span>
        ${surface ? `<button class="icon-btn" id="add-layer-btn" title="Add Layer">＋</button>` : ''}
      </div>
      ${!surface
        ? `<div class="panel-empty"><p>Select a surface<br>to manage layers</p></div>`
        : `<div class="layer-list" id="layer-list">
            ${layers.length === 0
              ? `<div class="panel-empty"><p>No layers yet.<br>Click <strong>+</strong> to add one.</p></div>`
              : layers.slice().reverse().map((l) => this.layerItem(l)).join('')
            }
           </div>`
      }
    `;

    document.getElementById('add-layer-btn')?.addEventListener('click', () => {
      if (!surfaceId) return;
      history.push(store.project);
      const layer = store.addLayer({ surfaceId });
      this.engine.loadMediaForLayer(layer.id);
      store.selectLayer(layer.id);
    });

    layers.forEach((layer) => {
      const row = document.getElementById(`layer-row-${layer.id}`);
      if (!row) return;

      row.addEventListener('click', () => store.selectLayer(layer.id));

      // Visibility
      row.querySelector('.layer-visible')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer({ ...layer, visible: !layer.visible });
      });

      // Delete
      row.querySelector('.layer-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        history.push(store.project);
        store.removeLayer(layer.id);
        this.engine.media.remove(layer.id);
      });

      // Opacity
      const opSlider = row.querySelector('.opacity-slider') as HTMLInputElement | null;
      opSlider?.addEventListener('input', () => {
        store.updateLayer({ ...layer, opacity: parseFloat(opSlider.value) });
      });

      // Blend mode
      const blendSel = row.querySelector('.blend-select') as HTMLSelectElement | null;
      blendSel?.addEventListener('change', () => {
        store.updateLayer({ ...layer, blendMode: blendSel.value as BlendMode });
      });

      // Source picker
      row.querySelector('.source-file-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pickSourceFile(layer);
      });

      row.querySelector('.source-camera-btn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        store.updateLayer({ ...layer, source: { type: 'camera' } });
        await this.engine.loadMediaForLayer(layer.id);
      });

      // Text source button
      row.querySelector('.source-text-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer({ ...layer, source: {
          type: 'text',
          text: layer.source.text ?? 'Hello World',
          textColor: layer.source.textColor ?? '#ffffff',
          textBg: layer.source.textBg ?? 'transparent',
          textSize: layer.source.textSize ?? 72,
        }});
      });

      // Text content input
      const textContentInput = row.querySelector('.text-content-input') as HTMLInputElement | null;
      textContentInput?.addEventListener('input', () => {
        store.updateLayer({ ...layer, source: { ...layer.source, text: textContentInput.value } });
      });

      // Text color input
      const textColorInput = row.querySelector('.text-color-input') as HTMLInputElement | null;
      textColorInput?.addEventListener('input', () => {
        store.updateLayer({ ...layer, source: { ...layer.source, textColor: textColorInput.value } });
      });

      // Text background color input
      const textBgInput = row.querySelector('.text-bg-input') as HTMLInputElement | null;
      const textBgTransp = row.querySelector('.text-bg-transparent') as HTMLInputElement | null;
      textBgInput?.addEventListener('input', () => {
        const isTransp = textBgTransp?.checked;
        store.updateLayer({ ...layer, source: { ...layer.source, textBg: isTransp ? 'transparent' : textBgInput.value } });
      });
      textBgTransp?.addEventListener('change', () => {
        store.updateLayer({ ...layer, source: { ...layer.source, textBg: textBgTransp.checked ? 'transparent' : (textBgInput?.value ?? '#000000') } });
      });

      // Text size slider
      const textSizeInput = row.querySelector('.text-size-input') as HTMLInputElement | null;
      const textSizeVal = row.querySelector('.text-size-val') as HTMLElement | null;
      textSizeInput?.addEventListener('input', () => {
        const size = parseInt(textSizeInput.value);
        if (textSizeVal) textSizeVal.textContent = `${size}px`;
        store.updateLayer({ ...layer, source: { ...layer.source, textSize: size } });
      });

      row.querySelector('.source-color-input')?.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        store.updateLayer({ ...layer, source: { type: 'color', color: input.value } });
      });
    });
  }

  private layerItem(layer: Layer): string {
    const isSelected = store.ui.selectedLayerId === layer.id;
    const src = layer.source;

    const sourceDisplay = src.type === 'color'
      ? `<span class="src-color-swatch" style="background:${src.color ?? '#6366f1'}"></span> Solid Color`
      : src.type === 'camera' ? '📷 Live Camera'
      : src.type === 'text' ? `🔤 "${(src.text ?? '').slice(0, 16)}${(src.text ?? '').length > 16 ? '…' : ''}"`
      : src.url ? `🎬 ${src.url.split('/').pop()?.slice(0, 20) ?? 'media'}`
      : '— none —';

    const textControls = src.type === 'text' ? `
      <div class="text-source-controls">
        <div class="insp-row">
          <label>Text</label>
          <input type="text" class="text-content-input" value="${(src.text ?? 'Hello World').replace(/"/g, '&quot;')}" placeholder="Enter text..." style="flex:1">
        </div>
        <div class="insp-row">
          <label>Color</label>
          <input type="color" class="text-color-input" value="${src.textColor ?? '#ffffff'}" title="Text color">
          <label>BG</label>
          <input type="color" class="text-bg-input" value="${src.textBg && src.textBg !== 'transparent' ? src.textBg : '#000000'}" title="Background color">
          <label>Transp</label>
          <input type="checkbox" class="text-bg-transparent" ${!src.textBg || src.textBg === 'transparent' ? 'checked' : ''}>
        </div>
        <div class="insp-row">
          <label>Size</label>
          <input type="range" class="text-size-input" min="12" max="200" step="2" value="${src.textSize ?? 72}" style="flex:1">
          <span class="text-size-val">${src.textSize ?? 72}px</span>
        </div>
      </div>
    ` : '';

    return `
      <div class="layer-row ${isSelected ? 'selected' : ''}" id="layer-row-${layer.id}" data-id="${layer.id}">
        <div class="layer-row-top">
          <button class="layer-visible icon-btn-sm" title="Toggle visibility">${layer.visible ? '◉' : '○'}</button>
          <span class="layer-name">${layer.name}</span>
          <select class="blend-select" title="Blend mode">
            ${BLEND_MODES.map((m) => `<option value="${m}" ${layer.blendMode === m ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <button class="layer-delete icon-btn-sm danger" title="Delete">✕</button>
        </div>
        <div class="layer-row-bottom">
          <div class="layer-source-row">
            <span class="source-label">Source:</span>
            <span class="source-display">${sourceDisplay}</span>
            <button class="source-file-btn icon-btn-sm" title="Load image/video file">📂</button>
            <button class="source-camera-btn icon-btn-sm" title="Use live camera">📷</button>
            <button class="source-text-btn icon-btn-sm" title="Use text layer">🔤</button>
            ${src.type === 'color' ? `<input type="color" class="source-color-input" value="${src.color ?? '#6366f1'}" title="Solid color">` : ''}
          </div>
          ${textControls}
          <label class="opacity-row">
            <span>Opacity</span>
            <input type="range" class="opacity-slider" min="0" max="1" step="0.01" value="${layer.opacity}">
            <span>${Math.round(layer.opacity * 100)}%</span>
          </label>
        </div>
      </div>
    `;
  }

  private async pickSourceFile(layer: Layer) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';
      store.updateLayer({ ...layer, source: { type, url } });
      await this.engine.loadMediaForLayer(layer.id);
    };
    input.click();
  }
}


