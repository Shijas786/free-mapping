// ─── Beginner Playground & Quick-Start Preset Wizard ────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { sceneManager } from '../scenes/manager';
import type { RenderEngine } from '../render/engine';

export interface PresetDemo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  setup: () => void;
}

export class PlaygroundPanel {
  private el: HTMLElement;

  constructor(private engine: RenderEngine) {
    this.el = document.getElementById('playground-panel')!;
    this.render();
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header" style="background:linear-gradient(90deg, rgba(99,102,241,0.2), rgba(34,211,238,0.2))">
        <span class="panel-title" style="font-size:13px;color:#a5f3fc">✨ Beginner Playground</span>
      </div>

      <!-- Quick Guided Steps -->
      <div style="padding:12px;border-bottom:1px solid var(--clr-border)">
        <div class="props-label" style="color:var(--clr-accent-2);font-weight:700">🚀 3-Step Quick Start</div>
        <ol style="padding-left:18px;margin-top:6px;font-size:11px;color:var(--clr-text);line-height:1.7">
          <li><strong>Drag corners:</strong> Move the glowing blue dots on screen to match any object in your room.</li>
          <li><strong>Click a preset below:</strong> Load instant 3D building, disco, or art projections.</li>
          <li><strong>Press F:</strong> Go full screen on your projector!</li>
        </ol>
      </div>

      <!-- 1-Click Demo Presets -->
      <div style="padding:12px">
        <div class="props-label" style="margin-bottom:8px">1-Click Playground Presets</div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="pg-preset-card" id="preset-disco">
            <span class="pg-emoji">🌀</span>
            <div class="pg-info">
              <span class="pg-title">Psychedelic Disco Stage</span>
              <span class="pg-desc">Audio-reactive plasma & kaleidoscope visualizer</span>
            </div>
          </button>

          <button class="pg-preset-card" id="preset-building">
            <span class="pg-emoji">🏛️</span>
            <div class="pg-info">
              <span class="pg-title">3D Building Facade</span>
              <span class="pg-desc">Multi-surface architectural projection mapping</span>
            </div>
          </button>

          <button class="pg-preset-card" id="preset-box">
            <span class="pg-emoji">📦</span>
            <div class="pg-info">
              <span class="pg-title">3D Box / Cube Warp</span>
              <span class="pg-desc">Map patterns onto a 3D box or cardboard structure</span>
            </div>
          </button>

          <button class="pg-preset-card" id="preset-gallery">
            <span class="pg-emoji">🖼️</span>
            <div class="pg-info">
              <span class="pg-title">Cyber Art Frame</span>
              <span class="pg-desc">Neon edge-glow art projection frame</span>
            </div>
          </button>
        </div>
      </div>
    `;

    document.getElementById('preset-disco')?.addEventListener('click', () => this.loadDiscoPreset());
    document.getElementById('preset-building')?.addEventListener('click', () => this.loadBuildingPreset());
    document.getElementById('preset-box')?.addEventListener('click', () => this.loadBoxPreset());
    document.getElementById('preset-gallery')?.addEventListener('click', () => this.loadGalleryPreset());
  }

  private loadPresetProject(surfaces: any[], layers: any[]) {
    history.push(store.project);
    const newProj = {
      meta: { ...store.project.meta, updatedAt: new Date().toISOString() },
      surfaces,
      layers,
      outputs: store.project.outputs,
      audioBindings: [],
      controlBindings: [],
    };
    store.loadProject(newProj);
    if (surfaces.length > 0) store.selectSurface(surfaces[0].id);
    this.engine.loadAllMedia();
  }

  private loadDiscoPreset() {
    const surfaces = [
      {
        id: 'surf-disco',
        name: 'Disco Stage Quad',
        type: 'quad',
        points: [{ x: 0.15, y: 0.15 }, { x: 0.85, y: 0.15 }, { x: 0.85, y: 0.85 }, { x: 0.15, y: 0.85 }],
        visible: true,
      },
    ];
    const layers = [
      {
        id: 'layer-disco',
        surfaceId: 'surf-disco',
        name: 'Plasma Kaleidoscope',
        order: 0,
        source: { type: 'shader' },
        blendMode: 'normal',
        opacity: 1,
        visible: true,
        effects: [
          { id: 'fx-k', type: 'kaleidoscope', enabled: true, params: { segments: 8, rotation: 45, zoom: 1.2 } },
        ],
      },
    ];
    this.loadPresetProject(surfaces, layers);
  }

  private loadBuildingPreset() {
    const surfaces = [
      {
        id: 'surf-wall',
        name: 'Main Wall',
        type: 'quad',
        points: [{ x: 0.1, y: 0.1 }, { x: 0.6, y: 0.1 }, { x: 0.6, y: 0.9 }, { x: 0.1, y: 0.9 }],
        visible: true,
      },
      {
        id: 'surf-roof',
        name: 'Roof Triangle',
        type: 'quad',
        points: [{ x: 0.6, y: 0.1 }, { x: 0.9, y: 0.3 }, { x: 0.9, y: 0.7 }, { x: 0.6, y: 0.9 }],
        visible: true,
      },
    ];
    const layers = [
      {
        id: 'layer-wall', surfaceId: 'surf-wall', name: 'Wall Grid', order: 0,
        source: { type: 'shader' }, blendMode: 'normal', opacity: 1, visible: true, effects: [],
      },
      {
        id: 'layer-roof', surfaceId: 'surf-roof', name: 'Roof Glow', order: 0,
        source: { type: 'color', color: '#22d3ee' }, blendMode: 'add', opacity: 0.8, visible: true, effects: [],
      },
    ];
    this.loadPresetProject(surfaces, layers);
  }

  private loadBoxPreset() {
    const surfaces = [
      {
        id: 'surf-top', name: 'Box Top', type: 'quad',
        points: [{ x: 0.3, y: 0.15 }, { x: 0.7, y: 0.15 }, { x: 0.5, y: 0.4 }, { x: 0.1, y: 0.4 }], visible: true,
      },
      {
        id: 'surf-front', name: 'Box Front', type: 'quad',
        points: [{ x: 0.1, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.85 }, { x: 0.1, y: 0.85 }], visible: true,
      },
      {
        id: 'surf-right', name: 'Box Right', type: 'quad',
        points: [{ x: 0.5, y: 0.4 }, { x: 0.9, y: 0.4 }, { x: 0.9, y: 0.85 }, { x: 0.5, y: 0.85 }], visible: true,
      },
    ];
    const layers = surfaces.map((s, idx) => ({
      id: `layer-box-${idx}`, surfaceId: s.id, name: `${s.name} Pattern`, order: 0,
      source: { type: 'shader' }, blendMode: 'normal', opacity: 1, visible: true, effects: [],
    }));
    this.loadPresetProject(surfaces, layers);
  }

  private loadGalleryPreset() {
    const surfaces = [
      {
        id: 'surf-art', name: 'Art Frame Quad', type: 'quad',
        points: [{ x: 0.2, y: 0.15 }, { x: 0.8, y: 0.15 }, { x: 0.8, y: 0.85 }, { x: 0.2, y: 0.85 }], visible: true,
      },
    ];
    const layers = [
      {
        id: 'layer-art', surfaceId: 'surf-art', name: 'Cyberpunk Frame', order: 0,
        source: { type: 'shader' }, blendMode: 'normal', opacity: 1, visible: true,
        effects: [
          { id: 'fx-edge', type: 'edge-glow', enabled: true, params: { strength: 2.5, glowColor: 220, mix: 0.9 } },
        ],
      },
    ];
    this.loadPresetProject(surfaces, layers);
  }
}
