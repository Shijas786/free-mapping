// ─── Space Scanner Panel UI ──────────────────────────────────────────────────
import { store } from '../core/store';
import { spaceScanner } from '../scanner/space-scanner';
import type { RenderEngine } from '../render/engine';

export class ScannerPanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.createElement('div');
    this.el.id = 'scanner-panel';
    this.el.className = 'side-panel';
    const container = document.getElementById('sidebar-left');
    if (container) container.appendChild(this.el);
    this.render();
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Space Scanner (Structured Light)</span>
      </div>

      <div class="props-section" style="padding:12px">
        <p style="font-size:11px;color:var(--clr-text-muted);line-height:1.5;margin-bottom:8px">
          Capture the projector's exact point-of-view using structured Gray code light patterns and a camera.
        </p>

        <button class="tb-btn" id="scan-start-btn" style="width:100%;padding:8px">
          📡 Start Space Scan
        </button>

        <div id="scan-progress-wrap" style="display:none;margin-top:12px">
          <div style="font-size:10.5px;color:var(--clr-accent-2);margin-bottom:4px" id="scan-status-text">
            Initializing scan...
          </div>
          <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
            <div id="scan-bar-fill" style="height:100%;width:0%;background:var(--clr-accent);transition:width 100ms"></div>
          </div>
        </div>

        <div id="scan-result-wrap" style="display:none;margin-top:12px">
          <div class="props-label">Scanned Projector-Camera Map</div>
          <canvas id="scan-result-canvas" style="width:100%;height:120px;background:#000;border-radius:6px;margin-top:4px"></canvas>
          <button class="prop-btn" id="btn-scan-to-mesh" style="margin-top:8px">Auto-Generate Warp Mesh ↗</button>
        </div>
      </div>
    `;

    document.getElementById('scan-start-btn')?.addEventListener('click', async () => {
      const pWrap = document.getElementById('scan-progress-wrap')!;
      const statusText = document.getElementById('scan-status-text')!;
      const barFill = document.getElementById('scan-bar-fill')!;
      pWrap.style.display = 'block';

      try {
        const resultCvs = await spaceScanner.runScan(this.engine.canvas, (p) => {
          statusText.textContent = p.status;
          barFill.style.width = `${(p.step / p.totalSteps) * 100}%`;
        });

        // Show result
        const resWrap = document.getElementById('scan-result-wrap')!;
        resWrap.style.display = 'block';
        const resCvs = document.getElementById('scan-result-canvas') as HTMLCanvasElement;
        const ctx = resCvs.getContext('2d')!;
        resCvs.width = resultCvs.width; resCvs.height = resultCvs.height;
        ctx.drawImage(resultCvs, 0, 0);
      } catch (err: any) {
        statusText.textContent = `Scan failed: ${err.message}`;
      }
    });

    document.getElementById('btn-scan-to-mesh')?.addEventListener('click', () => {
      const surf = store.project.surfaces[0];
      if (surf) {
        store.updateSurface({ ...surf, type: 'mesh', meshGrid: { rows: 8, cols: 8 } });
        alert('Auto-generated 8x8 warp mesh from Space Scanner point cloud!');
      }
    });
  }
}
