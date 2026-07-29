// ─── Mesh Panel — upgrade quad to n×m mesh, edit grid ────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { quadToMesh } from '../math/mesh-warp';
import type { RenderEngine } from '../render/engine';

export class MeshPanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('mesh-panel')!;
    if (!this.el) return;
    this.render();
    store.bus.on('UI_STATE_CHANGED', () => this.render());
    store.bus.on('SURFACE_UPDATED',  () => this.render());
    store.bus.on('PROJECT_LOADED',   () => this.render());
  }

  private render() {
    const surfId  = store.ui.selectedSurfaceId;
    const surface = surfId ? store.getSurface(surfId) : null;

    if (!surface) {
      this.el.innerHTML = `
        <div class="panel-header"><span class="panel-title">Mesh Warp</span></div>
        <div class="panel-empty"><p>Select a surface to configure mesh</p></div>`;
      return;
    }

    const isMesh = surface.type === 'mesh';
    const rows = surface.meshGrid?.rows ?? 4;
    const cols = surface.meshGrid?.cols ?? 4;

    this.el.innerHTML = `
      <div class="panel-header"><span class="panel-title">Mesh — ${surface.name}</span></div>

      <div class="props-section">
        <div class="props-row">
          <label>Type</label>
          <span class="prop-badge">${surface.type}</span>
        </div>
        ${isMesh ? `
          <div class="props-row">
            <label>Rows</label>
            <input type="number" id="mesh-rows" class="prop-input prop-num"
              value="${rows}" min="1" max="32" step="1">
          </div>
          <div class="props-row">
            <label>Cols</label>
            <input type="number" id="mesh-cols" class="prop-input prop-num"
              value="${cols}" min="1" max="32" step="1">
          </div>
          <div class="props-row">
            <span style="font-size:11px;color:var(--clr-text-muted)">
              ${(rows + 1) * (cols + 1)} control points
            </span>
          </div>
        ` : ''}
      </div>

      <div class="props-section">
        ${!isMesh ? `
          <button class="prop-btn" id="btn-to-mesh">Upgrade to Mesh ↗</button>
          <p style="font-size:10px;color:var(--clr-text-muted);margin-top:6px;line-height:1.5">
            Convert this quad to a subdivided grid for non-planar surface mapping.
          </p>
        ` : `
          <button class="prop-btn" id="btn-apply-grid">Apply Grid Size</button>
          <button class="prop-btn" id="btn-reset-mesh" style="margin-top:4px">Reset to Flat</button>
          <button class="prop-btn" id="btn-to-quad" style="margin-top:4px">↙ Downgrade to Quad</button>
        `}
      </div>

      ${isMesh ? `
      <div class="props-section">
        <div class="props-label">Smooth / Warp Presets</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;padding-top:4px">
          <button class="prop-btn" id="mesh-barrel" style="flex:1">Barrel</button>
          <button class="prop-btn" id="mesh-pincushion" style="flex:1">Pincushion</button>
          <button class="prop-btn" id="mesh-wave" style="flex:1">Wave</button>
        </div>
      </div>
      ` : ''}
    `;

    document.getElementById('btn-to-mesh')?.addEventListener('click', () => {
      history.push(store.project);
      const newPts = quadToMesh(surface.points, 4, 4);
      store.updateSurface({ ...surface, type: 'mesh', meshGrid: { rows: 4, cols: 4 }, points: newPts });
      this.engine.invalidateMeshVAO(surface.id);
    });

    document.getElementById('btn-apply-grid')?.addEventListener('click', () => {
      const r = parseInt((document.getElementById('mesh-rows') as HTMLInputElement).value);
      const c = parseInt((document.getElementById('mesh-cols') as HTMLInputElement).value);
      if (!r || !c) return;
      history.push(store.project);
      const corners = [surface.points[0], surface.points[surface.meshGrid!.cols], surface.points[surface.points.length - 1 - surface.meshGrid!.cols], surface.points[surface.points.length - 1]];
      const newPts = quadToMesh(corners.length >= 4 ? corners : surface.points.slice(0, 4), r, c);
      store.updateSurface({ ...surface, meshGrid: { rows: r, cols: c }, points: newPts });
      this.engine.invalidateMeshVAO(surface.id);
    });

    document.getElementById('btn-reset-mesh')?.addEventListener('click', () => {
      history.push(store.project);
      const newPts = quadToMesh(surface.points.slice(0, 4), rows, cols);
      store.updateSurface({ ...surface, points: newPts });
      this.engine.invalidateMeshVAO(surface.id);
    });

    document.getElementById('btn-to-quad')?.addEventListener('click', () => {
      history.push(store.project);
      const r = surface.meshGrid!.rows, c = surface.meshGrid!.cols;
      const pts = surface.points;
      const corners = [
        pts[0],
        pts[c],
        pts[(r + 1) * (c + 1) - 1],
        pts[(r) * (c + 1)],
      ];
      store.updateSurface({ ...surface, type: 'quad', meshGrid: undefined, points: corners });
      this.engine.invalidateMeshVAO(surface.id);
    });

    // Preset warps
    document.getElementById('mesh-barrel')?.addEventListener('click', () => this.applyPreset(surface, 'barrel'));
    document.getElementById('mesh-pincushion')?.addEventListener('click', () => this.applyPreset(surface, 'pincushion'));
    document.getElementById('mesh-wave')?.addEventListener('click', () => this.applyPreset(surface, 'wave'));
  }

  private applyPreset(surface: any, type: string) {
    history.push(store.project);
    const { rows, cols } = surface.meshGrid!;
    const newPts = surface.points.map((p: any, idx: number) => {
      const r = Math.floor(idx / (cols + 1));
      const c = idx % (cols + 1);
      const u = c / cols - 0.5;
      const v = r / rows - 0.5;
      let dx = 0, dy = 0;
      if (type === 'barrel')     { dx = u * (u * u + v * v) * 0.3; dy = v * (u * u + v * v) * 0.3; }
      if (type === 'pincushion') { dx = -u * (u * u + v * v) * 0.3; dy = -v * (u * u + v * v) * 0.3; }
      if (type === 'wave')       { dy = Math.sin(u * Math.PI * 2) * 0.04; }
      return { x: Math.max(0.01, Math.min(0.99, p.x + dx)), y: Math.max(0.01, Math.min(0.99, p.y + dy)) };
    });
    store.updateSurface({ ...surface, points: newPts });
    this.engine.invalidateMeshVAO(surface.id);
  }
}
