// ─── Pub-Sub Store ─────────────────────────────────────────────────────────────
import type { AppEvent, Layer, OutputConfig, Project, Surface, UIState } from './types';
import { generateId } from './utils';

type Listener<T> = (value: T) => void;

class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<T extends AppEvent['type']>(
    type: T,
    cb: Listener<Extract<AppEvent, { type: T }>>
  ): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }

  emit<T extends AppEvent>(event: T) {
    this.listeners.get(event.type)?.forEach((cb) => cb(event));
  }
}

// ─── Default project factory ──────────────────────────────────────────────────

function createDefaultProject(): Project {
  const surfaceId = generateId();
  const layerId = generateId();

  return {
    meta: {
      name: 'Untitled Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    },
    surfaces: [
      {
        id: surfaceId,
        name: 'Surface 1',
        type: 'quad',
        points: [
          { x: 0.15, y: 0.15 },
          { x: 0.85, y: 0.15 },
          { x: 0.85, y: 0.85 },
          { x: 0.15, y: 0.85 },
        ],
        visible: true,
      },
    ],
    layers: [
      {
        id: layerId,
        surfaceId,
        name: 'Layer 1',
        order: 0,
        source: { type: 'color', color: '#6366f1' },
        blendMode: 'normal',
        opacity: 1,
        visible: true,
        effects: [],
      },
    ],
    outputs: [],
    audioBindings: [],
    controlBindings: [],
  };
}

// ─── Default UI State ─────────────────────────────────────────────────────────

function createDefaultUI(): UIState {
  return {
    selectedSurfaceId: null,
    selectedLayerId: null,
    selectedPointIndex: null,
    activePanel: 'surface',
    draggingPointIndex: null,
    showGrid: false,
    showTestCard: false,
    calibrationMode: false,
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    isFullscreen: false,
    maskMode: false,
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

class Store {
  project: Project = createDefaultProject();
  ui: UIState = createDefaultUI();
  bus = new EventBus();

  // ── Project mutations ───────────────────────────────────────────────────────

  loadProject(project: Project) {
    this.project = project;
    this.ui.selectedSurfaceId = null;
    this.ui.selectedLayerId = null;
    this.bus.emit({ type: 'PROJECT_LOADED', project });
  }

  addSurface(surface?: Partial<Surface>): Surface {
    const id = generateId();
    const s: Surface = {
      id,
      name: `Surface ${this.project.surfaces.length + 1}`,
      type: 'quad',
      points: [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.2 },
        { x: 0.8, y: 0.8 },
        { x: 0.2, y: 0.8 },
      ],
      visible: true,
      ...surface,
    };
    this.project.surfaces.push(s);
    this.touch();
    this.bus.emit({ type: 'SURFACE_ADDED', surface: s });
    return s;
  }

  removeSurface(id: string) {
    this.project.surfaces = this.project.surfaces.filter((s) => s.id !== id);
    this.project.layers = this.project.layers.filter((l) => l.surfaceId !== id);
    if (this.ui.selectedSurfaceId === id) this.ui.selectedSurfaceId = null;
    this.touch();
    this.bus.emit({ type: 'SURFACE_REMOVED', id });
  }

  updateSurface(surface: Surface) {
    const idx = this.project.surfaces.findIndex((s) => s.id === surface.id);
    if (idx !== -1) this.project.surfaces[idx] = surface;
    this.touch();
    this.bus.emit({ type: 'SURFACE_UPDATED', surface });
  }

  movePoint(surfaceId: string, index: number, point: { x: number; y: number }) {
    const s = this.project.surfaces.find((s) => s.id === surfaceId);
    if (!s) return;
    s.points[index] = point;
    this.touch();
    this.bus.emit({ type: 'POINT_MOVED', surfaceId, index, point });
  }

  addLayer(layer?: Partial<Layer>): Layer {
    const id = generateId();
    const surfaceId = this.ui.selectedSurfaceId ?? this.project.surfaces[0]?.id ?? '';
    const l: Layer = {
      id,
      surfaceId,
      name: `Layer ${this.project.layers.length + 1}`,
      order: this.project.layers.filter((l) => l.surfaceId === surfaceId).length,
      source: { type: 'color', color: '#6366f1' },
      blendMode: 'normal',
      opacity: 1,
      visible: true,
      effects: [],
      ...layer,
    };
    this.project.layers.push(l);
    this.touch();
    this.bus.emit({ type: 'LAYER_ADDED', layer: l });
    return l;
  }

  removeLayer(id: string) {
    this.project.layers = this.project.layers.filter((l) => l.id !== id);
    if (this.ui.selectedLayerId === id) this.ui.selectedLayerId = null;
    this.touch();
    this.bus.emit({ type: 'LAYER_REMOVED', id });
  }

  updateLayer(layer: Layer) {
    const idx = this.project.layers.findIndex((l) => l.id === layer.id);
    if (idx !== -1) this.project.layers[idx] = layer;
    this.touch();
    this.bus.emit({ type: 'LAYER_UPDATED', layer });
  }

  addOutput(output: OutputConfig) {
    this.project.outputs.push(output);
    this.touch();
  }

  // ── UI mutations ────────────────────────────────────────────────────────────

  setUI(partial: Partial<UIState>) {
    Object.assign(this.ui, partial);
    this.bus.emit({ type: 'UI_STATE_CHANGED', uiState: this.ui });
  }

  selectSurface(id: string | null) {
    this.setUI({ selectedSurfaceId: id, selectedPointIndex: null });
  }

  selectLayer(id: string | null) {
    this.setUI({ selectedLayerId: id });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private touch() {
    this.project.meta.updatedAt = new Date().toISOString();
  }

  getSurface(id: string) {
    return this.project.surfaces.find((s) => s.id === id);
  }

  getLayers(surfaceId: string) {
    return this.project.layers
      .filter((l) => l.surfaceId === surfaceId)
      .sort((a, b) => a.order - b.order);
  }

  serialize(): string {
    return JSON.stringify(this.project, null, 2);
  }

  deserialize(json: string): boolean {
    try {
      const p = JSON.parse(json) as Project;
      this.loadProject(p);
      return true;
    } catch {
      return false;
    }
  }
}

export const store = new Store();
