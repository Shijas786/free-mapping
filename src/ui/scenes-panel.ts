// ─── Scenes Panel — capture / recall / blend ─────────────────────────────────
import { store } from '../core/store';
import { sceneManager } from '../scenes/manager';
import type { RenderEngine } from '../render/engine';

export class ScenesPanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('scenes-panel')!;
    this.render();
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Scenes</span>
        <button class="icon-btn" id="capture-scene-btn" title="Capture current scene">⊕</button>
      </div>

      <div class="scenes-list" id="scenes-list">
        ${sceneManager.scenes.length === 0
          ? `<div class="panel-empty"><p>No scenes yet.<br>Click <strong>⊕</strong> to capture.</p></div>`
          : sceneManager.scenes.map((s) => this.sceneCard(s)).join('')
        }
      </div>

      <div style="padding:8px;border-top:1px solid var(--clr-border)">
        <div class="props-label">Cross-Fade</div>
        <div style="display:flex;align-items:center;gap:8px;padding-top:4px">
          <input type="range" id="crossfade-slider" min="0" max="1" step="0.01" value="0"
            style="flex:1;height:3px">
          <span id="crossfade-val" style="font-size:10px;font-family:var(--font-mono)">0%</span>
        </div>
        <div class="props-label" style="margin-top:6px">Blend Duration (s)</div>
        <input type="number" id="blend-dur" value="2" min="0.1" max="60" step="0.1"
          class="prop-input" style="width:80px;margin-top:4px">
      </div>
    `;

    document.getElementById('capture-scene-btn')?.addEventListener('click', async () => {
      const name = `Scene ${sceneManager.scenes.length + 1}`;
      await sceneManager.capture(name, this.engine.canvas);
      this.render();
    });

    sceneManager.scenes.forEach((scene) => {
      const card = document.getElementById(`scene-card-${scene.id}`);
      if (!card) return;

      card.querySelector('.scene-recall')?.addEventListener('click', () => {
        sceneManager.recall(scene.id);
        this.engine.loadAllMedia();
      });

      card.querySelector('.scene-delete')?.addEventListener('click', () => {
        sceneManager.remove(scene.id);
        this.render();
      });

      card.querySelector('.scene-name-el')?.addEventListener('dblclick', () => {
        const nameEl = card.querySelector('.scene-name-el') as HTMLElement;
        const inp = document.createElement('input');
        inp.value = scene.name; inp.className = 'inline-edit';
        nameEl.replaceWith(inp); inp.focus();
        inp.addEventListener('blur',   () => { scene.name = inp.value; this.render(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      });
    });

    // Crossfade slider — requires at least 2 scenes
    const cf = document.getElementById('crossfade-slider') as HTMLInputElement | null;
    const cfVal = document.getElementById('crossfade-val');
    cf?.addEventListener('input', () => {
      if (cfVal) cfVal.textContent = `${Math.round(parseFloat(cf.value) * 100)}%`;
      if (sceneManager.scenes.length >= 2) {
        sceneManager.blend(sceneManager.scenes[0], sceneManager.scenes[1], parseFloat(cf.value));
      }
    });
  }

  private sceneCard(scene: any): string {
    return `
      <div class="scene-card" id="scene-card-${scene.id}">
        ${scene.thumbnail
          ? `<img class="scene-thumb" src="${scene.thumbnail}" alt="Scene thumbnail">`
          : `<div class="scene-thumb scene-thumb-empty">◈</div>`
        }
        <div class="scene-info">
          <span class="scene-name-el">${scene.name}</span>
          <span style="font-size:10px;color:var(--clr-text-muted);font-family:var(--font-mono)">
            ${new Date(scene.createdAt).toLocaleTimeString()}
          </span>
        </div>
        <div class="scene-actions">
          <button class="scene-recall tb-btn" title="Recall">▶</button>
          <button class="scene-delete icon-btn-sm danger" title="Delete">✕</button>
        </div>
      </div>
    `;
  }
}
