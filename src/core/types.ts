// ─── Core Types ────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export type SurfaceType = 'quad' | 'mesh' | 'model3d';

export type BlendMode = 'normal' | 'add' | 'multiply' | 'screen' | 'subtract';

export type SourceType = 'video' | 'image' | 'camera' | 'shader' | 'color' | 'text';

export interface SourceRef {
  type: SourceType;
  url?: string;           // video/image URL or data URL
  shaderCode?: string;    // generative GLSL fragment source
  color?: string;         // solid color hex for 'color' type
  text?: string;          // text content for 'text' type
  textColor?: string;     // text foreground color (hex)
  textBg?: string;        // text background color (hex, transparent)
  textSize?: number;      // font size in px (default 64)
  textFont?: string;      // font family (default Inter)
}

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type EffectType =
  | 'chroma-key'
  | 'luma-key'
  | 'hue-shift'
  | 'brightness-contrast'
  | 'invert'
  | 'posterize'
  | 'threshold'
  | 'color-grading'
  | 'pixelate'
  | 'chromatic-aberration'
  | 'displacement'
  | 'kaleidoscope'
  | 'mirror'
  | 'zoom-rotate'
  | 'gaussian-blur'
  | 'edge-glow'
  | 'glitch'
  | 'vignette'
  | 'scanlines'
  | 'noise-field'
  | 'plasma';


export interface Layer {
  id: string;
  surfaceId: string;
  name: string;
  order: number;
  source: SourceRef;
  blendMode: BlendMode;
  opacity: number;        // 0–1
  visible: boolean;
  effects: Effect[];
}

export interface MeshGrid {
  rows: number;
  cols: number;
}

export interface CameraPose {
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
}

export interface Surface {
  id: string;
  name: string;
  type: SurfaceType;
  /** 
   * quad: 4 corner points [TL, TR, BR, BL] in normalized 0–1 stage coords
   * mesh: (rows+1)*(cols+1) points in row-major order
   */
  points: Point[];
  meshGrid?: MeshGrid;
  model3d?: { objUrl: string; cameraPose: CameraPose };
  mask?: Point[];         // polygon mask vertices
  visible: boolean;
}

export interface BlendZone {
  edge: 'left' | 'right' | 'top' | 'bottom';
  width: number;          // fraction of output 0–1
  gamma: number;
}

export interface OutputConfig {
  id: string;
  name: string;
  screenId?: string;      // Window Management API screen id
  surfaceIds: string[];   // which surfaces are routed here
  blendZones: BlendZone[];
}

export interface AudioBinding {
  id: string;
  targetLayerId: string;
  targetEffectId?: string;
  targetParam: string;    // which param name on the layer/effect
  fftBand: [number, number]; // [startBin, endBin]
  sensitivity: number;
  smoothing: number;      // 0–1 AnalyserNode smoothingTimeConstant
  min: number;
  max: number;
}

export interface ControlBinding {
  id: string;
  targetLayerId: string;
  targetEffectId?: string;
  targetParam: string;
  protocol: 'artnet' | 'osc';
  channel: number;        // DMX channel 1-512 or OSC address
  oscAddress?: string;
}

export interface ProjectMeta {
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Project {
  meta: ProjectMeta;
  surfaces: Surface[];
  layers: Layer[];
  outputs: OutputConfig[];
  audioBindings: AudioBinding[];
  controlBindings: ControlBinding[];
}

// ─── UI State (not persisted) ──────────────────────────────────────────────────

export interface UIState {
  selectedSurfaceId: string | null;
  selectedLayerId: string | null;
  selectedPointIndex: number | null;
  activePanel: PanelId;
  draggingPointIndex: number | null;
  showGrid: boolean;
  showTestCard: boolean;
  calibrationMode: boolean;
  zoom: number;
  panOffset: Point;
  isFullscreen: boolean;
  maskMode: boolean;
  viewSpace: 'input' | 'output';
  masterDimmer: number; // 0-1
  blackout: boolean;
  freeze: boolean;
  masterBpm: number;
}

export type PanelId = 'surfaces' | 'surface' | 'layer' | 'effects' | 'mesh' | 'mask' | 'scenes' | 'audio' | 'shader' | 'output' | 'midi' | 'scanner';

// ─── Events ───────────────────────────────────────────────────────────────────

export type AppEvent =
  | { type: 'PROJECT_LOADED'; project: Project }
  | { type: 'SURFACE_ADDED'; surface: Surface }
  | { type: 'SURFACE_REMOVED'; id: string }
  | { type: 'SURFACE_UPDATED'; surface: Surface }
  | { type: 'LAYER_ADDED'; layer: Layer }
  | { type: 'LAYER_REMOVED'; id: string }
  | { type: 'LAYER_UPDATED'; layer: Layer }
  | { type: 'POINT_MOVED'; surfaceId: string; index: number; point: Point }
  | { type: 'UI_STATE_CHANGED'; uiState: UIState };
