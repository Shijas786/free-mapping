// ─── Mask Tool — polygon masking per surface ──────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { dist } from '../core/utils';
import type { Point } from '../core/types';

export class MaskTool {
  private active = false;
  private svg: SVGSVGElement;
  private overlayContainer: HTMLElement;
  private pathEl: SVGPolygonElement | null = null;
  private pointEls: SVGCircleElement[] = [];

  constructor(overlayContainer: HTMLElement) {
    this.overlayContainer = overlayContainer;
    this.svg = overlayContainer?.querySelector('.overlay-svg') as SVGSVGElement;
    if (!this.svg) return;
    store.bus.on('UI_STATE_CHANGED', () => {
      if (!store.ui.maskMode) this.deactivate();
    });
  }

  activate() {
    this.active = true;
    const surface = store.ui.selectedSurfaceId ? store.getSurface(store.ui.selectedSurfaceId) : null;
    if (!surface) return;
    this.rebuildMaskUI(surface.mask ?? []);
    this.svg.style.cursor = 'crosshair';
    this.svg.addEventListener('click', this.onClick);
  }

  deactivate() {
    this.active = false;
    this.svg.style.cursor = 'default';
    this.svg.removeEventListener('click', this.onClick);
    this.pointEls.forEach((c) => c.remove());
    this.pointEls = [];
    this.pathEl?.remove();
    this.pathEl = null;
  }

  private onClick = (e: MouseEvent) => {
    if (!this.active) return;
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const surface = store.getSurface(surfId);
    if (!surface) return;

    const rect = this.svg.getBoundingClientRect();
    const pt: Point = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    };

    // Check if clicking near first point → close polygon
    const mask = surface.mask ?? [];
    if (mask.length > 2 && dist(pt, mask[0]) < 0.03) {
      // Close
      history.push(store.project);
      store.updateSurface({ ...surface, mask });
      this.deactivate();
      store.setUI({ maskMode: false } as any);
      return;
    }

    history.push(store.project);
    store.updateSurface({ ...surface, mask: [...mask, pt] });
    this.rebuildMaskUI([...(surface.mask ?? []), pt]);
  };

  private rebuildMaskUI(pts: Point[]) {
    this.pointEls.forEach((c) => c.remove()); this.pointEls = [];
    this.pathEl?.remove();

    if (pts.length < 1) return;

    const W = this.svg.clientWidth;
    const H = this.svg.clientHeight;

    // Polygon line
    this.pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    this.pathEl.setAttribute('points', pts.map((p) => `${p.x*W},${p.y*H}`).join(' '));
    this.pathEl.setAttribute('fill', 'rgba(239,68,68,0.15)');
    this.pathEl.setAttribute('stroke', '#ef4444');
    this.pathEl.setAttribute('stroke-width', '1.5');
    this.pathEl.setAttribute('stroke-dasharray', '4 3');
    this.svg.appendChild(this.pathEl);

    pts.forEach((p, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', String(p.x * W)); c.setAttribute('cy', String(p.y * H));
      c.setAttribute('r', '5');
      c.setAttribute('fill', i === 0 ? '#ef4444' : '#fbbf24');
      c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1');
      this.svg.appendChild(c);
      this.pointEls.push(c);
    });
  }

  clearMask() {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const surface = store.getSurface(surfId);
    if (!surface) return;
    history.push(store.project);
    store.updateSurface({ ...surface, mask: [] });
    this.deactivate();
  }
}

// ── Mask panel UI ─────────────────────────────────────────────────────────────

export class MaskPanel {
  private el: HTMLElement | null = null;
  private tool: MaskTool;

  constructor(overlayContainer: HTMLElement) {
    this.el = document.getElementById('mask-panel');
    this.tool = new MaskTool(overlayContainer);
    if (!this.el) return;
    this.render();
    store.bus.on('UI_STATE_CHANGED', () => this.render());
    store.bus.on('SURFACE_UPDATED',  () => this.render());
    store.bus.on('PROJECT_LOADED',   () => this.render());
  }

  private render() {
    if (!this.el) return;
    const surfId  = store.ui.selectedSurfaceId;
    const surface = surfId ? store.getSurface(surfId) : null;
    const hasMask = surface?.mask && surface.mask.length >= 3;

    this.el.innerHTML = `
      <div class="panel-header"><span class="panel-title">Polygon Mask</span></div>

      ${!surface
        ? `<div class="panel-empty"><p>Select a surface to add a mask</p></div>`
        : `
        <div class="props-section">
          <div class="props-row">
            <label>Surface</label>
            <span class="prop-badge">${surface.name}</span>
          </div>
          <div class="props-row">
            <label>Points</label>
            <span>${surface.mask?.length ?? 0}</span>
          </div>
        </div>
        <div class="props-section">
          <button class="prop-btn" id="btn-draw-mask" style="${(store.ui as any).maskMode ? 'background:rgba(239,68,68,0.2);border-color:#ef4444;color:#ef4444' : ''}">
            ${(store.ui as any).maskMode ? '✕ Cancel Drawing' : '✏ Draw Mask'}
          </button>
          ${hasMask ? `<button class="prop-btn" id="btn-clear-mask" style="margin-top:4px;color:var(--clr-red)">🗑 Clear Mask</button>` : ''}
          ${hasMask ? `
            <div class="props-label" style="margin-top:8px">Feather</div>
            <div class="props-row">
              <input type="range" id="mask-feather" min="0" max="1" step="0.05"
                value="${surface.mask?.length ? 0.3 : 0}" style="flex:1;height:3px">
              <span id="mask-feather-val">0.30</span>
            </div>
          ` : ''}
        </div>
        <div class="props-section">
          <div class="props-label">Mask Mode</div>
          <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">
            <input type="checkbox" id="mask-invert" ${(surface as any).maskInvert ? 'checked' : ''}>
            Invert Mask
          </label>
        </div>
        ${(store.ui as any).maskMode ? `
          <div class="mask-hint">
            Click canvas to add polygon vertices.<br>
            Click first vertex (red dot) to close the polygon.
          </div>
        ` : ''}
      `}
    `;

    document.getElementById('btn-draw-mask')?.addEventListener('click', () => {
      const mode = !(store.ui as any).maskMode;
      store.setUI({ maskMode: mode } as any);
      if (mode) this.tool.activate(); else this.tool.deactivate();
      this.render();
    });

    document.getElementById('btn-clear-mask')?.addEventListener('click', () => {
      this.tool.clearMask();
    });
  }
}
