// ─── WebMapper Pro Inputs Panel ─────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { DEFAULT_MEDIA_ITEMS, type MediaBinItem } from './media-bin';

export class InputsPanel {
  private el: HTMLElement;
  private currentFilter = 'all';
  private selectedInput: MediaBinItem | null = DEFAULT_MEDIA_ITEMS[0];

  constructor() {
    this.el = document.getElementById('inputs-list-container')!;
    if (!this.el) return;
    this.render();
    this.bindEvents();
  }

  render() {
    const items = DEFAULT_MEDIA_ITEMS.filter((item) =>
      this.currentFilter === 'all' ? true : item.category === this.currentFilter
    );

    this.el.innerHTML = items.map((item) => `
      <div class="input-item-card ${this.selectedInput?.id === item.id ? 'active' : ''}" data-id="${item.id}">
        <div class="item-thumb" style="background:${item.thumbColor ?? '#6366f1'}"></div>
        <div class="item-info">
          <div class="item-name">${item.name}</div>
          <div class="item-badge">${item.category} · ${item.type}</div>
        </div>
      </div>
    `).join('');

    this.bindItemClicks();
  }

  private bindEvents() {
    document.querySelectorAll('.filter-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentFilter = (tab as HTMLElement).dataset.cat ?? 'all';
        this.render();
      });
    });
  }

  private bindItemClicks() {
    this.el.querySelectorAll('.input-item-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.id;
        const item = DEFAULT_MEDIA_ITEMS.find((m) => m.id === id);
        if (item) {
          this.selectedInput = item;
          this.render();
          this.assignToSurface(item);
        }
      });
    });
  }

  private assignToSurface(item: MediaBinItem) {
    const surfId = store.ui.selectedSurfaceId ?? store.project.surfaces[0]?.id;
    if (!surfId) return;

    const layer = store.getLayers(surfId)[0];
    if (layer) {
      history.push(store.project);
      store.updateLayer({
        ...layer,
        source: {
          type: item.type,
          color: item.thumbColor,
        },
      });
    }
  }
}
