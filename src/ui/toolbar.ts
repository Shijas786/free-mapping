// ─── Toolbar ──────────────────────────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { saveProject, loadProject, exportJSON, importJSON } from '../core/idb';
import type { RenderEngine } from '../render/engine';

export class Toolbar {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('toolbar')!;
    this.render();
    this.bindShortcuts();

    store.bus.on('UI_STATE_CHANGED', () => this.updateButtonStates());
    store.bus.on('PROJECT_LOADED',   () => this.updateButtonStates());
  }

  private render() {
    this.el.innerHTML = `
      <div class="toolbar-brand">
        <span class="brand-icon">◈</span>
        <span class="brand-name">WebMapper</span>
        <span class="brand-tag">v0.1</span>
      </div>

      <div class="toolbar-center">
        <div class="toolbar-group">
          <button id="btn-undo"  class="tb-btn" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 20 20"><path d="M4 7h8a5 5 0 010 10H8" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><polyline points="4,3 4,7 8,7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
          </button>
          <button id="btn-redo"  class="tb-btn" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 20 20"><path d="M16 7H8a5 5 0 000 10h4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/><polyline points="16,3 16,7 12,7" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="toolbar-sep"></div>
        <div class="toolbar-group">
          <button id="btn-grid"     class="tb-btn tb-toggle" title="Toggle grid (G)">
            <svg viewBox="0 0 20 20"><rect x="2" y="2" width="7" height="7" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="11" y="2" width="7" height="7" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="2" y="11" width="7" height="7" stroke="currentColor" stroke-width="1.5" fill="none"/><rect x="11" y="11" width="7" height="7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
            Grid
          </button>
          <button id="btn-testcard" class="tb-btn tb-toggle" title="Toggle test card (T)">
            <svg viewBox="0 0 20 20"><rect x="2" y="5" width="16" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="10" y1="5" x2="10" y2="15" stroke="currentColor" stroke-width="1"/><line x1="6"  y1="5" x2="6"  y2="15" stroke="currentColor" stroke-width="1"/><line x1="14" y1="5" x2="14" y2="15" stroke="currentColor" stroke-width="1"/></svg>
            Test
          </button>
        </div>
        <div class="toolbar-sep"></div>
        <div class="toolbar-group">
          <button id="btn-fullscreen" class="tb-btn" title="Fullscreen output (F)">
            <svg viewBox="0 0 20 20"><polyline points="3,8 3,3 8,3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><polyline points="17,8 17,3 12,3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><polyline points="3,12 3,17 8,17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/><polyline points="17,12 17,17 12,17" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>
            Output
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="project-name" id="project-name-display">${store.project.meta.name}</div>
        <div class="toolbar-group">
          <button id="btn-save"   class="tb-btn tb-primary" title="Save (Ctrl+S)">Save</button>
          <button id="btn-export" class="tb-btn"            title="Export JSON">Export</button>
          <button id="btn-import" class="tb-btn"            title="Import JSON">Import</button>
        </div>
        <div class="autosave-indicator" id="autosave-indicator">●  Saved</div>
      </div>
    `;

    this.bindButtons();
  }

  private bindButtons() {
    const $ = (id: string) => document.getElementById(id);

    $('btn-undo')?.addEventListener('click', () => this.undo());
    $('btn-redo')?.addEventListener('click', () => this.redo());

    $('btn-grid')?.addEventListener('click', () => {
      store.setUI({ showGrid: !store.ui.showGrid });
      this.updateButtonStates();
    });

    $('btn-testcard')?.addEventListener('click', () => {
      store.setUI({ showTestCard: !store.ui.showTestCard });
      this.updateButtonStates();
    });

    $('btn-fullscreen')?.addEventListener('click', () => {
      this.engine.requestFullscreen();
    });

    $('btn-save')?.addEventListener('click', async () => {
      await saveProject(store.project);
      this.showSaved();
    });

    $('btn-export')?.addEventListener('click', () => {
      exportJSON(store.project);
    });

    $('btn-import')?.addEventListener('click', async () => {
      try {
        const json = await importJSON();
        const ok = store.deserialize(json);
        if (ok) {
          await this.engine.loadAllMedia();
          this.showSaved('Imported!');
        }
      } catch (err) {
        console.error('Import failed', err);
      }
    });
  }

  private undo() {
    const prev = history.undo();
    if (prev) {
      store.loadProject(prev);
      store.setUI({ selectedSurfaceId: null, selectedPointIndex: null });
    }
  }

  private redo() {
    const next = history.redo();
    if (next) {
      store.loadProject(next);
      store.setUI({ selectedSurfaceId: null, selectedPointIndex: null });
    }
  }

  updateButtonStates() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.toggleAttribute('disabled', !history.canUndo());
    if (redoBtn) redoBtn.toggleAttribute('disabled', !history.canRedo());

    document.getElementById('btn-grid')?.classList.toggle('active', store.ui.showGrid);
    document.getElementById('btn-testcard')?.classList.toggle('active', store.ui.showTestCard);

    const nameEl = document.getElementById('project-name-display');
    if (nameEl) nameEl.textContent = store.project.meta.name;
  }

  private showSaved(msg = '●  Saved') {
    const el = document.getElementById('autosave-indicator');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 1500);
  }

  private bindShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); this.undo(); }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
        if (e.key === 's') { e.preventDefault(); saveProject(store.project).then(() => this.showSaved()); }
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'g') store.setUI({ showGrid: !store.ui.showGrid });
        if (e.key === 't') store.setUI({ showTestCard: !store.ui.showTestCard });
        if (e.key === 'f' || e.key === 'F') this.engine.requestFullscreen();
      }
    });
  }
}
