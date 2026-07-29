// ─── Output Panel — multi-projector + edge blending ──────────────────────────
import { store } from '../core/store';
import { generateId } from '../core/utils';
import type { RenderEngine } from '../render/engine';
import type { OutputConfig } from '../core/types';

export class OutputPanel {
  private el: HTMLElement;
  private outputWindows = new Map<string, Window>();

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('output-panel')!;
    if (!this.el) return;
    this.render();
    store.bus.on('PROJECT_LOADED', () => this.render());
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Output / Projectors</span>
        <button class="icon-btn" id="add-output-btn" title="Add output">＋</button>
      </div>

      <div class="output-controls">
        <button class="tb-btn" id="btn-fullscreen-main" title="Fullscreen on primary display">
          ◫ Fullscreen (F)
        </button>
        <button class="tb-btn" id="btn-open-secondary" title="Open output on secondary screen">
          ◧ New Window
        </button>
        ${this.hasScreenAPI()
          ? `<button class="tb-btn" id="btn-all-screens" title="Fullscreen on all screens">⊞ All Screens</button>`
          : `<span class="output-note">Window Management API: not available in this browser</span>`
        }
      </div>

      <div class="output-list">
        ${store.project.outputs.map((o) => this.outputItem(o)).join('')}
        ${store.project.outputs.length === 0
          ? `<div class="panel-empty" style="padding:12px;font-size:11px">
               Add outputs to configure multi-projector setup
             </div>` : ''}
      </div>

      <div class="edge-blend-section">
        <div class="props-label">Edge Blending</div>
        <div class="props-row"><label>Left</label>
          <input type="range" id="eb-left" min="0" max="0.5" step="0.01" value="0" style="flex:1;height:3px">
          <span id="eb-left-val">0%</span>
        </div>
        <div class="props-row"><label>Right</label>
          <input type="range" id="eb-right" min="0" max="0.5" step="0.01" value="0" style="flex:1;height:3px">
          <span id="eb-right-val">0%</span>
        </div>
        <div class="props-row"><label>Gamma</label>
          <input type="range" id="eb-gamma" min="0.5" max="3" step="0.05" value="1" style="flex:1;height:3px">
          <span id="eb-gamma-val">1.0</span>
        </div>
      </div>
    `;

    document.getElementById('btn-fullscreen-main')?.addEventListener('click', () => {
      this.engine.requestFullscreen();
    });

    document.getElementById('btn-open-secondary')?.addEventListener('click', () => {
      this.openOutputWindow();
    });

    document.getElementById('btn-all-screens')?.addEventListener('click', async () => {
      await this.openAllScreens();
    });

    document.getElementById('add-output-btn')?.addEventListener('click', () => {
      const output: OutputConfig = {
        id: generateId(),
        name: `Output ${store.project.outputs.length + 1}`,
        surfaceIds: store.project.surfaces.map((s) => s.id),
        blendZones: [],
      };
      store.addOutput(output);
      this.render();
    });

    // Edge blend live preview
    ['left','right','gamma'].forEach((side) => {
      const el = document.getElementById(`eb-${side}`) as HTMLInputElement | null;
      const val = document.getElementById(`eb-${side}-val`);
      el?.addEventListener('input', () => {
        if (val) val.textContent = side === 'gamma'
          ? parseFloat(el.value).toFixed(2)
          : `${Math.round(parseFloat(el.value) * 100)}%`;
      });
    });
  }

  private outputItem(o: OutputConfig): string {
    return `
      <div class="output-row" id="output-row-${o.id}">
        <span class="output-name">${o.name}</span>
        <span style="font-size:10px;color:var(--clr-text-muted)">${o.surfaceIds.length} surfaces</span>
        <button class="icon-btn-sm danger output-delete" data-id="${o.id}">✕</button>
      </div>
    `;
  }

  private hasScreenAPI(): boolean {
    return 'getScreenDetails' in window;
  }

  private openOutputWindow(): Window | null {
    const w = window.open('', '_blank', 'width=1280,height=720,menubar=no,toolbar=no,location=no');
    if (!w) return null;

    w.document.write(`<!DOCTYPE html><html><head>
      <style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden}</style>
    </head><body>
      <canvas id="out-canvas" style="width:100%;height:100%"></canvas>
      <script>
        const canvas = document.getElementById('out-canvas');
        canvas.width = screen.width; canvas.height = screen.height;
        // Receive ImageBitmap frames via BroadcastChannel
        const bc = new BroadcastChannel('webmapper-output');
        const ctx = canvas.getContext('bitmaprenderer');
        bc.onmessage = (e) => { if (ctx && e.data.type === 'frame') ctx.transferFromImageBitmap(e.data.bitmap); };
      </script>
    </body></html>`);

    this.outputWindows.set(generateId(), w);

    // Start piping frames
    this.startFramePipe();

    return w;
  }

  private bc: BroadcastChannel | null = null;
  private pipeRunning = false;

  private startFramePipe() {
    if (this.pipeRunning) return;
    this.pipeRunning = true;
    if (!this.bc) this.bc = new BroadcastChannel('webmapper-output');
    const bc = this.bc;
    const engine = this.engine;
    const pipe = async () => {
      if (!this.pipeRunning) return;
      try {
        const bitmap = await createImageBitmap(engine.canvas);
        bc.postMessage({ type: 'frame', bitmap });
      } catch {}
      requestAnimationFrame(pipe);
    };
    requestAnimationFrame(pipe);
  }

  private async openAllScreens() {
    try {
      const details = await (window as any).getScreenDetails();
      for (const screen of details.screens) {
        const w = window.open('', '_blank',
          `left=${screen.left},top=${screen.top},width=${screen.width},height=${screen.height}`);
        if (w) {
          w.moveTo(screen.left, screen.top);
          w.resizeTo(screen.width, screen.height);
          setTimeout(() => w.document.documentElement.requestFullscreen?.(), 500);
        }
      }
    } catch (e) {
      alert('Window Management API not permitted. Grant "window-management" permission.');
    }
  }
}
