// ─── Surface Panel ────────────────────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { generateId } from '../core/utils';
import type { RenderEngine } from '../render/engine';

export class SurfacePanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('surface-panel')!;
    this.render();

    store.bus.on('SURFACE_ADDED',   () => this.render());
    store.bus.on('SURFACE_REMOVED', () => this.render());
    store.bus.on('SURFACE_UPDATED', () => this.render());
    store.bus.on('PROJECT_LOADED',  () => this.render());
    store.bus.on('UI_STATE_CHANGED', () => this.highlightSelected());
  }

  private render() {
    const surfaces = store.project.surfaces;

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Surfaces</span>
        <button class="icon-btn" id="add-surface-btn" title="Add Surface">＋</button>
      </div>
      <div class="surface-list" id="surface-list">
        ${surfaces.map((s) => this.surfaceItem(s)).join('')}
      </div>
    `;

    document.getElementById('add-surface-btn')?.addEventListener('click', () => {
      history.push(store.project);
      const s = store.addSurface();
      store.selectSurface(s.id);
    });

    surfaces.forEach((s) => {
      const row = document.getElementById(`surface-row-${s.id}`);
      if (!row) return;

      row.addEventListener('click', () => store.selectSurface(s.id));

      row.querySelector('.surface-visible')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateSurface({ ...s, visible: !s.visible });
      });

      row.querySelector('.surface-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        history.push(store.project);
        store.removeSurface(s.id);
      });

      const nameEl = row.querySelector('.surface-name') as HTMLElement | null;
      nameEl?.addEventListener('dblclick', () => {
        const input = document.createElement('input');
        input.value = s.name;
        input.className = 'inline-edit';
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        const commit = () => {
          store.updateSurface({ ...s, name: input.value.trim() || s.name });
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
      });
    });

    this.highlightSelected();
  }

  private surfaceItem(s: any): string {
    const layerCount = store.project.layers.filter((l) => l.surfaceId === s.id).length;
    return `
      <div class="surface-row" id="surface-row-${s.id}" data-id="${s.id}">
        <span class="surface-type-badge">${s.type}</span>
        <span class="surface-name">${s.name}</span>
        <span class="surface-meta">${layerCount}L · ${s.points.length}pts</span>
        <button class="surface-visible icon-btn-sm" title="Toggle visibility">
          ${s.visible ? '◉' : '○'}
        </button>
        <button class="surface-delete icon-btn-sm danger" title="Delete surface">✕</button>
      </div>
    `;
  }

  private highlightSelected() {
    const { selectedSurfaceId } = store.ui;
    document.querySelectorAll('.surface-row').forEach((row) => {
      const el = row as HTMLElement;
      el.classList.toggle('selected', el.dataset.id === selectedSurfaceId);
    });
  }
}
