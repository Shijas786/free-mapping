// ─── Canvas Overlay — drag handles, polygon mask tool ────────────────────────
import { store } from '../core/store';
import { dist } from '../core/utils';
import { history } from '../core/history';
import type { Point, Surface } from '../core/types';

const HANDLE_RADIUS   = 10;   // px
const HANDLE_SNAP_PX  = 18;   // hit target radius
const SELECTED_COLOR  = '#a5f3fc';  // cyan-200
const DEFAULT_COLOR   = '#818cf8';  // indigo-400
const GLOW_COLOR      = 'rgba(99,102,241,0.35)';

export class CanvasOverlay {
  private svg: SVGSVGElement;
  private handles: Map<string, SVGCircleElement[]> = new Map();
  private labelMap: Map<string, SVGTextElement[]>  = new Map();
  private dragging: { surfaceId: string; index: number } | null = null;
  private animFrame = 0;
  private pulsePhase = 0;

  constructor(private container: HTMLElement) {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'overlay-svg');
    this.container.appendChild(this.svg);

    this.bindEvents();
    this.buildHandles();

    // Rebuild whenever surfaces change
    store.bus.on('SURFACE_ADDED', () => this.buildHandles());
    store.bus.on('SURFACE_REMOVED', () => this.buildHandles());
    store.bus.on('PROJECT_LOADED', () => this.buildHandles());
    store.bus.on('SURFACE_UPDATED', () => this.refreshPositions());
    store.bus.on('POINT_MOVED', () => this.refreshPositions());
    store.bus.on('UI_STATE_CHANGED', () => this.refreshStyles());

    this.startAnimation();
  }

  // ── Build/rebuild all handles ─────────────────────────────────────────────

  buildHandles() {
    // Clear
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    this.handles.clear();
    this.labelMap.clear();

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    // Glow filter
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.id = 'glow';
    filter.innerHTML = `
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    `;
    defs.appendChild(filter);
    this.svg.appendChild(defs);

    for (const surface of store.project.surfaces) {
      this.createSurfaceHandles(surface);
    }
    this.refreshPositions();
    this.refreshStyles();
  }

  private createSurfaceHandles(surface: Surface) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.dataset.surfaceId = surface.id;
    this.svg.appendChild(g);

    const circles: SVGCircleElement[] = [];
    const labels:  SVGTextElement[]   = [];

    // Surface outline polygon
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('class', 'surface-outline');
    poly.dataset.role = 'outline';
    g.appendChild(poly);

    const cornerLabels = ['TL', 'TR', 'BR', 'BL'];

    surface.points.forEach((_, idx) => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', String(HANDLE_RADIUS));
      circle.setAttribute('class', 'handle');
      circle.setAttribute('filter', 'url(#glow)');
      circle.dataset.surfaceId = surface.id;
      circle.dataset.index     = String(idx);
      g.appendChild(circle);
      circles.push(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.textContent = surface.type === 'quad' ? cornerLabels[idx] : String(idx);
      text.setAttribute('class', 'handle-label');
      text.dataset.surfaceId = surface.id;
      text.dataset.index     = String(idx);
      g.appendChild(text);
      labels.push(text);
    });

    this.handles.set(surface.id, circles);
    this.labelMap.set(surface.id, labels);
  }

  private refreshPositions() {
    const W = this.svg.clientWidth  || 1;
    const H = this.svg.clientHeight || 1;

    for (const surface of store.project.surfaces) {
      const circles = this.handles.get(surface.id) ?? [];
      const labels  = this.labelMap.get(surface.id) ?? [];

      // Update polygon outline
      const g = this.svg.querySelector(`g[data-surface-id="${surface.id}"]`);
      const poly = g?.querySelector('polygon[data-role="outline"]') as SVGPolygonElement | null;
      if (poly) {
        poly.setAttribute('points',
          surface.points.map((p) => `${p.x * W},${p.y * H}`).join(' ')
        );
      }

      surface.points.forEach((p, idx) => {
        const cx = p.x * W;
        const cy = p.y * H;
        circles[idx]?.setAttribute('cx', String(cx));
        circles[idx]?.setAttribute('cy', String(cy));
        labels[idx]?.setAttribute('x',  String(cx + 14));
        labels[idx]?.setAttribute('y',  String(cy + 4));
      });
    }
  }

  private refreshStyles() {
    const { selectedSurfaceId, selectedPointIndex } = store.ui;

    for (const [surfaceId, circles] of this.handles) {
      const isSelected = surfaceId === selectedSurfaceId;
      circles.forEach((c, idx) => {
        const isActivePoint = isSelected && idx === selectedPointIndex;
        c.setAttribute('fill', isActivePoint ? SELECTED_COLOR : DEFAULT_COLOR);
        c.setAttribute('stroke', isActivePoint ? '#fff' : DEFAULT_COLOR);
        c.setAttribute('stroke-width', isActivePoint ? '2.5' : '1.5');
        c.style.opacity = isSelected ? '1' : '0.55';
      });

      // Outline
      const g = this.svg.querySelector(`g[data-surface-id="${surfaceId}"]`);
      const poly = g?.querySelector('polygon[data-role="outline"]') as SVGPolygonElement | null;
      if (poly) {
        poly.setAttribute('stroke', isSelected ? '#6366f1' : 'rgba(99,102,241,0.3)');
        poly.setAttribute('stroke-width', isSelected ? '1.5' : '0.8');
        poly.setAttribute('fill', 'rgba(99,102,241,0.04)');
      }
    }
  }

  // ── Animation — pulsing glow ───────────────────────────────────────────────

  private startAnimation() {
    const tick = () => {
      this.pulsePhase += 0.04;
      const s = 0.75 + 0.25 * Math.sin(this.pulsePhase);
      document.documentElement.style.setProperty('--handle-glow-size', `${s * 8}px`);
      this.animFrame = requestAnimationFrame(tick);
    };
    this.animFrame = requestAnimationFrame(tick);
  }

  // ── Pointer events ────────────────────────────────────────────────────────

  private bindEvents() {
    this.svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove',  (e) => this.onPointerMove(e));
    window.addEventListener('pointerup',    ()  => this.onPointerUp());
    window.addEventListener('keydown',      (e) => this.onKeyDown(e));
    window.addEventListener('resize',       ()  => this.refreshPositions());
  }

  private getPointerNorm(e: PointerEvent): Point {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    };
  }

  private findClosestHandle(p: Point): { surfaceId: string; index: number } | null {
    const W = this.svg.clientWidth;
    const H = this.svg.clientHeight;
    const snapNorm = HANDLE_SNAP_PX / Math.min(W, H);

    let best: { surfaceId: string; index: number } | null = null;
    let bestDist = Infinity;

    for (const surface of store.project.surfaces) {
      if (!surface.visible) continue;
      surface.points.forEach((pt, idx) => {
        const d = dist(p, pt);
        if (d < bestDist && d < snapNorm) {
          bestDist = d;
          best = { surfaceId: surface.id, index: idx };
        }
      });
    }
    return best;
  }

  private onPointerDown(e: PointerEvent) {
    const p = this.getPointerNorm(e);
    const hit = this.findClosestHandle(p);

    if (hit) {
      this.dragging = hit;
      store.selectSurface(hit.surfaceId);
      store.setUI({ selectedPointIndex: hit.index });
      // save undo snapshot before drag
      history.push(store.project);
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
    } else {
      // Click on surface outline → select surface
      const target = e.target as SVGElement;
      const surfId = target.dataset.surfaceId;
      if (surfId) {
        store.selectSurface(surfId);
      } else {
        store.selectSurface(null);
        store.setUI({ selectedPointIndex: null });
      }
    }
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const rect = this.svg.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top)  / rect.height;

    // Magnetic Snapping (1% threshold)
    const SNAP_THRESH = 0.015;

    // 1. Grid snapping (if grid active)
    if (store.ui.showGrid) {
      const gx = Math.round(x * 16) / 16;
      const gy = Math.round(y * 16) / 16;
      if (Math.abs(x - gx) < SNAP_THRESH) x = gx;
      if (Math.abs(y - gy) < SNAP_THRESH) y = gy;
    }

    // 2. Snap to other surface points
    for (const s of store.project.surfaces) {
      if (s.id === this.dragging.surfaceId) continue;
      for (const p of s.points) {
        if (Math.abs(x - p.x) < SNAP_THRESH && Math.abs(y - p.y) < SNAP_THRESH) {
          x = p.x; y = p.y;
          break;
        }
      }
    }

    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    store.movePoint(this.dragging.surfaceId, this.dragging.index, { x, y });
  };

  private onPointerUp() {
    this.dragging = null;
  }

  private onPointerMove(e: PointerEvent) {
    if (!this.dragging) return;
    const p = this.getPointerNorm(e);
    const clamped = {
      x: Math.max(0.005, Math.min(0.995, p.x)),
      y: Math.max(0.005, Math.min(0.995, p.y)),
    };
    store.movePoint(this.dragging.surfaceId, this.dragging.index, clamped);
  }

  private onKeyDown(e: KeyboardEvent) {
    const { selectedSurfaceId, selectedPointIndex } = store.ui;
    if (selectedSurfaceId === null || selectedPointIndex === null) return;
    if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;

    const surface = store.getSurface(selectedSurfaceId);
    if (!surface) return;

    const step = e.shiftKey ? 0.01 : 0.001; // 1% or 0.1% of stage
    const pt = { ...surface.points[selectedPointIndex] };

    if (e.key === 'ArrowLeft')  pt.x -= step;
    if (e.key === 'ArrowRight') pt.x += step;
    if (e.key === 'ArrowUp')    pt.y -= step;
    if (e.key === 'ArrowDown')  pt.y += step;

    pt.x = Math.max(0.005, Math.min(0.995, pt.x));
    pt.y = Math.max(0.005, Math.min(0.995, pt.y));

    store.movePoint(selectedSurfaceId, selectedPointIndex, pt);
    e.preventDefault();
  }

  destroy() {
    cancelAnimationFrame(this.animFrame);
    this.svg.remove();
  }
}
