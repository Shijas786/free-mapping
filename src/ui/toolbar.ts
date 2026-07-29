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
    this.bindButtons();
  }

  private bindButtons() {
    const $ = (id: string) => document.getElementById(id);

    $('btn-space-input')?.addEventListener('click', () => {
      store.setUI({ viewSpace: 'input' });
    });

    $('btn-space-output')?.addEventListener('click', () => {
      store.setUI({ viewSpace: 'output' });
    });

    $('btn-blackout')?.addEventListener('click', () => {
      store.setUI({ blackout: !store.ui.blackout });
    });

    $('btn-freeze')?.addEventListener('click', () => {
      store.setUI({ freeze: !store.ui.freeze });
    });

    const dimmerSlider = $('master-dimmer-slider') as HTMLInputElement | null;
    dimmerSlider?.addEventListener('input', () => {
      store.setUI({ masterDimmer: parseFloat(dimmerSlider.value) });
    });

    let tapTimes: number[] = [];
    $('btn-tap-tempo')?.addEventListener('click', () => {
      const now = performance.now();
      tapTimes.push(now);
      if (tapTimes.length > 8) tapTimes.shift();
      if (tapTimes.length >= 2) {
        const intervals = [];
        for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const bpm = Math.round(60000 / avg);
        store.setUI({ masterBpm: bpm });
        const disp = $('bpm-display');
        if (disp) disp.textContent = `${bpm} BPM`;
      }
    });

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

    document.getElementById('btn-space-input')?.classList.toggle('active', store.ui.viewSpace === 'input');
    document.getElementById('btn-space-output')?.classList.toggle('active', store.ui.viewSpace === 'output');
    document.getElementById('btn-blackout')?.classList.toggle('active', store.ui.blackout);
    document.getElementById('btn-freeze')?.classList.toggle('active', store.ui.freeze);

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
