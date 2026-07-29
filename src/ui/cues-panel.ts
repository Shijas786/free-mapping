// ─── Cues & Show Automation Panel ──────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { sceneManager } from '../scenes/manager';

export interface Cue {
  id: string;
  name: string;
  sceneId: string;
  fadeDurationSec: number;
  hotkey?: string;
}

export class CuesPanel {
  private el: HTMLElement;
  cues: Cue[] = [];

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'cues-panel';
    this.el.className = 'side-panel';
    const container = document.getElementById('sidebar-left');
    if (container) container.appendChild(this.el);
    this.render();
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Show Cues</span>
        <button class="icon-btn" id="add-cue-btn" title="Add Cue">⊕</button>
      </div>

      <div class="cue-list" id="cue-list">
        ${this.cues.length === 0
          ? `<div class="panel-empty"><p>No cues set.<br>Click <strong>⊕</strong> to create a cue snapshot.</p></div>`
          : this.cues.map((c, i) => this.cueRow(c, i)).join('')}
      </div>
    `;

    document.getElementById('add-cue-btn')?.addEventListener('click', async () => {
      const scene = await sceneManager.capture(`Cue ${this.cues.length + 1}`);
      const cue: Cue = {
        id: Math.random().toString(36).slice(2),
        name: `Cue ${this.cues.length + 1}`,
        sceneId: scene.id,
        fadeDurationSec: 2.0,
      };
      this.cues.push(cue);
      this.render();
    });

    this.cues.forEach((c, idx) => {
      const row = document.getElementById(`cue-row-${c.id}`);
      if (!row) return;

      row.querySelector('.cue-trigger')?.addEventListener('click', () => {
        sceneManager.recall(c.sceneId);
      });

      row.querySelector('.cue-delete')?.addEventListener('click', () => {
        this.cues.splice(idx, 1);
        this.render();
      });
    });
  }

  private cueRow(c: Cue, index: number): string {
    return `
      <div class="binding-row" id="cue-row-${c.id}">
        <span style="font-weight:600;color:var(--clr-accent-2)">#${index + 1}</span>
        <span style="flex:1">${c.name}</span>
        <span style="font-size:10px;font-family:var(--font-mono)">${c.fadeDurationSec}s fade</span>
        <button class="cue-trigger tb-btn" style="padding:2px 8px">GO ▶</button>
        <button class="cue-delete icon-btn-sm danger">✕</button>
      </div>
    `;
  }
}
