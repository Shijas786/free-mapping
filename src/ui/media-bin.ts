// ─── MadMapper Media Bin & Media Inspector ──────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import type { RenderEngine } from '../render/engine';

export interface MediaBinItem {
  id: string;
  name: string;
  category: 'Generators' | 'Materials' | 'Movies' | 'Images' | 'Live Input';
  type: 'color' | 'shader' | 'video' | 'image' | 'camera';
  thumbColor?: string;
  shaderCode?: string;
  url?: string;
}

export const DEFAULT_MEDIA_ITEMS: MediaBinItem[] = [
  // Generators
  { id: 'gen-testcard', name: 'TestCard', category: 'Generators', type: 'color', thumbColor: '#475569' },
  { id: 'gen-colorpatterns', name: 'ColorPatterns', category: 'Generators', type: 'color', thumbColor: '#f43f5e' },
  { id: 'gen-grid', name: 'Grid Generator', category: 'Generators', type: 'color', thumbColor: '#0ea5e9' },
  { id: 'gen-solid', name: 'Solid Color', category: 'Generators', type: 'color', thumbColor: '#6366f1' },

  // Materials (Generative GLSL)
  { id: 'mat-plasma', name: 'Plasma', category: 'Materials', type: 'shader', thumbColor: '#8b5cf6' },
  { id: 'mat-noise', name: 'Clouds & Noise', category: 'Materials', type: 'shader', thumbColor: '#06b6d4' },
  { id: 'mat-lines', name: 'Line Repeat', category: 'Materials', type: 'shader', thumbColor: '#10b981' },
  { id: 'mat-kaleido', name: 'Kaleidoscope', category: 'Materials', type: 'shader', thumbColor: '#f59e0b' },

  // Live Input
  { id: 'cam-live', name: 'Webcam / USB Camera', category: 'Live Input', type: 'camera', thumbColor: '#ec4899' },
];

export class MediaBinPanel {
  private el: HTMLElement;
  isGridView = true;
  thumbSize: 'small' | 'med' | 'large' = 'med';
  selectedItem: MediaBinItem | null = DEFAULT_MEDIA_ITEMS[0];

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('properties-panel')!;
    this.render();
  }

  render() {
    this.el.innerHTML = `
      <div class="panel-header" style="justify-content:space-between">
        <span class="panel-title">Media Bin</span>
        <div style="display:flex;align-items:center;gap:4px">
          <button class="icon-btn-sm ${this.isGridView ? 'active' : ''}" id="mbin-view-grid" title="Grid View">⊞</button>
          <button class="icon-btn-sm ${!this.isGridView ? 'active' : ''}" id="mbin-view-list" title="List View">☰</button>
        </div>
      </div>

      <!-- Categories & Items -->
      <div class="mbin-scroll" style="flex:1;overflow-y:auto;padding:8px">
        ${this.renderCategory('Generators')}
        ${this.renderCategory('Materials')}
        ${this.renderCategory('Live Input')}
        ${this.renderCategory('Movies')}
      </div>

      <!-- Media Inspector (Bottom Part 2) -->
      <div class="mbin-inspector" style="padding:10px;border-top:1px solid var(--clr-border);background:rgba(0,0,0,0.3)">
        <div class="props-label" style="margin-bottom:6px">Media Inspector</div>
        ${this.selectedItem ? `
          <div style="display:flex;gap:10px;align-items:center">
            <div style="width:54px;height:54px;border-radius:6px;background:${this.selectedItem.thumbColor ?? '#6366f1'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;color:#fff;border:1px solid var(--clr-border)">
              ${this.selectedItem.name.slice(0, 3)}
            </div>
            <div style="flex:1">
              <div style="font-size:12px;font-weight:600">${this.selectedItem.name}</div>
              <div style="font-size:10px;color:var(--clr-text-muted);margin-top:2px">${this.selectedItem.category} · ${this.selectedItem.type}</div>
              <button class="tb-btn" id="mbin-apply-btn" style="margin-top:6px;font-size:10px;padding:3px 8px">Assign to Surface ↗</button>
            </div>
          </div>
        ` : `<div style="font-size:11px;color:var(--clr-text-muted)">Select a media item above</div>`}
      </div>
    `;

    document.getElementById('mbin-view-grid')?.addEventListener('click', () => { this.isGridView = true; this.render(); });
    document.getElementById('mbin-view-list')?.addEventListener('click', () => { this.isGridView = false; this.render(); });

    document.querySelectorAll('.mbin-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.itemId;
        const item = DEFAULT_MEDIA_ITEMS.find((m) => m.id === id);
        if (item) {
          this.selectedItem = item;
          this.render();
        }
      });
    });

    document.getElementById('mbin-apply-btn')?.addEventListener('click', () => {
      if (!this.selectedItem) return;
      const surfId = store.ui.selectedSurfaceId ?? store.project.surfaces[0]?.id;
      if (!surfId) return;

      const layer = store.getLayers(surfId)[0];
      if (layer) {
        history.push(store.project);
        store.updateLayer({
          ...layer,
          source: {
            type: this.selectedItem.type,
            color: this.selectedItem.thumbColor,
          },
        });
      }
    });
  }

  private renderCategory(cat: MediaBinItem['category']): string {
    const items = DEFAULT_MEDIA_ITEMS.filter((m) => m.category === cat);
    if (items.length === 0 && cat === 'Movies') {
      return `
        <div style="margin-bottom:10px">
          <div class="mbin-cat-header">▼ Movies & Images</div>
          <div style="font-size:10.5px;color:var(--clr-text-muted);padding:4px 8px">Drag & drop files here or click ⊕</div>
        </div>
      `;
    }

    return `
      <div style="margin-bottom:10px">
        <div class="mbin-cat-header">▼ ${cat}</div>
        <div class="${this.isGridView ? 'mbin-grid' : 'mbin-list'}">
          ${items.map((item) => `
            <button class="mbin-item-btn ${this.selectedItem?.id === item.id ? 'active' : ''}" data-item-id="${item.id}">
              <div class="mbin-thumb" style="background:${item.thumbColor ?? '#6366f1'}"></div>
              <span class="mbin-name">${item.name}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }
}
