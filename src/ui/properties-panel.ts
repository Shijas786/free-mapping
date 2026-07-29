// ─── Properties Panel (Inspector) ────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';

export class PropertiesPanel {
  private el: HTMLElement;

  constructor() {
    this.el = document.getElementById('properties-panel')!;
    if (!this.el) return;
    this.render();

    store.bus.on('UI_STATE_CHANGED',  () => this.render());
    store.bus.on('SURFACE_UPDATED',   () => this.render());
    store.bus.on('POINT_MOVED',       () => this.render());
    store.bus.on('PROJECT_LOADED',    () => this.render());
  }

  private render() {
    const { selectedSurfaceId, selectedPointIndex } = store.ui;
    const surface = selectedSurfaceId ? store.getSurface(selectedSurfaceId) : null;

    if (!surface) {
      this.el.innerHTML = `
        <div class="panel-header"><span class="panel-title">Inspector</span></div>
        <div class="panel-empty"><p>Select a surface<br>to inspect its properties</p></div>
      `;
      return;
    }

    const pt = selectedPointIndex !== null ? surface.points[selectedPointIndex] : null;

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Inspector</span>
      </div>

      <div class="props-section">
        <div class="props-label">Surface</div>
        <div class="props-row">
          <label>Name</label>
          <input type="text" id="prop-name" value="${surface.name}" class="prop-input">
        </div>
        <div class="props-row">
          <label>Type</label>
          <span class="prop-badge">${surface.type}</span>
        </div>
        <div class="props-row">
          <label>Points</label>
          <span>${surface.points.length}</span>
        </div>
      </div>

      ${pt !== null && selectedPointIndex !== null ? `
        <div class="props-section">
          <div class="props-label">Point ${selectedPointIndex} ${['TL','TR','BR','BL'][selectedPointIndex] ?? ''}</div>
          <div class="props-row">
            <label>X</label>
            <input type="number" id="prop-px" class="prop-input prop-num" value="${pt.x.toFixed(4)}" step="0.001" min="0" max="1">
          </div>
          <div class="props-row">
            <label>Y</label>
            <input type="number" id="prop-py" class="prop-input prop-num" value="${pt.y.toFixed(4)}" step="0.001" min="0" max="1">
          </div>
        </div>
      ` : ''}

      <div class="props-section">
        <div class="props-label">All Corners</div>
        ${surface.points.map((p, i) => `
          <div class="props-row">
            <label>${['TL','TR','BR','BL'][i] ?? i}</label>
            <span>(${p.x.toFixed(3)}, ${p.y.toFixed(3)})</span>
          </div>
        `).join('')}
        <button class="prop-btn" id="btn-reset-corners" title="Reset to default rectangle">Reset Quad</button>
      </div>
    `;

    // Name change
    document.getElementById('prop-name')?.addEventListener('change', (e) => {
      store.updateSurface({ ...surface, name: (e.target as HTMLInputElement).value });
    });

    // Point XY inputs
    const pxEl = document.getElementById('prop-px') as HTMLInputElement | null;
    const pyEl = document.getElementById('prop-py') as HTMLInputElement | null;
    const commitPoint = () => {
      if (selectedPointIndex === null || !pxEl || !pyEl) return;
      history.push(store.project);
      store.movePoint(surface.id, selectedPointIndex, {
        x: parseFloat(pxEl.value),
        y: parseFloat(pyEl.value),
      });
    };
    pxEl?.addEventListener('change', commitPoint);
    pyEl?.addEventListener('change', commitPoint);

    // Reset
    document.getElementById('btn-reset-corners')?.addEventListener('click', () => {
      history.push(store.project);
      store.updateSurface({
        ...surface,
        points: [
          { x: 0.15, y: 0.15 },
          { x: 0.85, y: 0.15 },
          { x: 0.85, y: 0.85 },
          { x: 0.15, y: 0.85 },
        ],
      });
    });
  }
}
