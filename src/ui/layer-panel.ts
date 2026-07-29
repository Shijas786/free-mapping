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
      ? `<span class="src-color-swatch" style="background:${src.color ?? '#6366f1'}"></span> Solid`
      : src.type === 'camera' ? '📷 Camera'
      : src.url ? `🎬 ${src.url.split('/').pop()?.slice(0, 20) ?? 'media'}`
      : '— none —';

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
            <button class="source-file-btn icon-btn-sm" title="Load file">📂</button>
            <button class="source-camera-btn icon-btn-sm" title="Use camera">📷</button>
            ${src.type === 'color' ? `<input type="color" class="source-color-input" value="${src.color ?? '#6366f1'}" title="Color">` : ''}
          </div>
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


