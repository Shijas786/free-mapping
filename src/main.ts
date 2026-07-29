// ─── WebMapper — Main entry point ────────────────────────────────────────────
import { store } from './core/store';
import { history } from './core/history';
import { loadProject, saveProject } from './core/idb';
import { audioAnalyser } from './audio/analyser';
import { lfoEngine } from './core/oscillators';
import { sceneManager } from './scenes/manager';
import { RenderEngine } from './render/engine';
import { CanvasOverlay } from './ui/canvas-overlay';
import { Toolbar } from './ui/toolbar';
import { SurfacePanel } from './ui/surface-panel';
import { LayerPanel } from './ui/layer-panel';
import { PropertiesPanel } from './ui/properties-panel';
import { EffectsPanel } from './ui/effects-panel';
import { AudioPanel } from './ui/audio-panel';
import { OutputPanel } from './ui/output-panel';
import { MeshPanel } from './ui/mesh-panel';
import { MaskPanel } from './ui/mask-panel';
import { ScenesPanel } from './ui/scenes-panel';
import { ShaderEditor } from './ui/shader-editor';
import { MIDIPanel } from './ui/midi-panel';
import { ScannerPanel } from './ui/scanner-panel';
import { MediaBinPanel } from './ui/media-bin';
import { InputsPanel } from './ui/inputs-panel';
import { bindAllAppControls } from './ui/app-binder';

import { setupDragAndDrop, showToast } from './ui/toast';

async function main() {
  // ── Restore autosaved project ──────────────────────────────────────────────
  const saved = await loadProject();
  if (saved) store.loadProject(saved);
  await sceneManager.loadAll();
  history.push(store.project);

  // ── Canvas + Engine ────────────────────────────────────────────────────────
  const canvas  = document.getElementById('stage-canvas') as HTMLCanvasElement;
  const stageEl = document.getElementById('canvas-stage-wrapper') || canvas.parentElement!;
  const engine  = new RenderEngine(canvas);

  const resizeCanvas = () => {
    if (stageEl.clientWidth && stageEl.clientHeight) {
      engine.resize(stageEl.clientWidth, stageEl.clientHeight);
    }
  };
  resizeCanvas();
  new ResizeObserver(resizeCanvas).observe(stageEl);

  await engine.loadAllMedia();

  // ── Drag & Drop File Upload onto Stage ─────────────────────────────────────
  setupDragAndDrop(stageEl, async (file) => {
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);

    let surfId = store.ui.selectedSurfaceId;
    if (!surfId && store.project.surfaces.length > 0) {
      surfId = store.project.surfaces[0].id;
    }
    if (!surfId) {
      const newSurf = store.addSurface({ type: 'quad' });
      surfId = newSurf.id;
    }

    let layers = store.getLayers(surfId);
    let targetLayer = layers[0];
    if (!targetLayer) {
      targetLayer = store.addLayer({ surfaceId: surfId });
    }

    history.push(store.project);
    store.updateLayer({
      ...targetLayer,
      source: {
        type: isVideo ? 'video' : 'image',
        url,
      },
    });
    await engine.loadMediaForLayer(targetLayer.id);
  });

  // ── SVG Overlay ───────────────────────────────────────────────────────────
  const overlayEl = document.getElementById('stage-overlay')!;
  if (overlayEl) new CanvasOverlay(overlayEl);

  // ── UI Panels & Button Event Binders ──────────────────────────────────────
  new Toolbar(engine);
  new InputsPanel();
  new SurfacePanel(engine);
  new LayerPanel(engine);
  new PropertiesPanel();
  new MediaBinPanel(engine);
  bindAllAppControls(engine);
  new EffectsPanel();
  new AudioPanel();
  new OutputPanel(engine);
  new MeshPanel(engine);
  new MaskPanel(overlayEl);
  new ScenesPanel(engine);
  new ShaderEditor();
  new MIDIPanel();
  new ScannerPanel(engine);

  // ── Left panel tabs (Inputs / Surfaces) ───────────────────────────────────
  const activateLeftTab = (tabId: string) => {
    document.querySelectorAll<HTMLElement>('.lp-sub').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll<HTMLElement>('.lp-tab').forEach((t) => t.classList.remove('active'));
    const sub = document.getElementById(`lp-${tabId}`);
    if (sub) sub.classList.add('active');
    document.querySelectorAll<HTMLElement>('.lp-tab').forEach((t) => {
      if ((t as HTMLElement).dataset.lp === tabId) t.classList.add('active');
    });
  };
  document.querySelectorAll<HTMLElement>('.lp-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateLeftTab(tab.dataset.lp!));
  });

  // ── Right panel tabs (Inspector / Outputs / FX / MIDI) ─────────────────────
  const activateRightTab = (tabId: string) => {
    document.querySelectorAll<HTMLElement>('.rp-sub').forEach((p) => { p.style.display = 'none'; });
    document.querySelectorAll<HTMLElement>('.rp-tab').forEach((t) => t.classList.remove('active'));
    const sub = document.getElementById(`rp-${tabId}`);
    if (sub) { sub.style.display = 'flex'; sub.style.flexDirection = 'column'; }
    document.querySelectorAll<HTMLElement>('.rp-tab').forEach((t) => {
      if ((t as HTMLElement).dataset.rp === tabId) t.classList.add('active');
    });
  };
  document.querySelectorAll<HTMLElement>('.rp-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateRightTab(tab.dataset.rp!));
  });

  activateLeftTab('inputs');
  activateRightTab('inspector');

  // ── Render loop ────────────────────────────────────────────────────────────
  engine.start();

  // ── Audio & LFO tick (synced with render frame) ──────────────────────────
  const frameTick = () => {
    const t = engine.time;
    audioAnalyser.tick();
    lfoEngine.tick(t);
    requestAnimationFrame(frameTick);
  };
  requestAnimationFrame(frameTick);

  // ── Stage info bar ─────────────────────────────────────────────────────────
  let frames = 0, lastFps = performance.now(), fps = 0;
  const infoTick = () => {
    frames++;
    const now = performance.now();
    if (now - lastFps >= 500) {
      fps = Math.round(frames / ((now - lastFps) / 1000));
      frames = 0; lastFps = now;
    }
    const set = (id: string, v: string) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stage-res',     `${canvas.width}×${canvas.height}`);
    set('stage-fps',     `${fps} fps`);
    set('stage-surfaces',`${store.project.surfaces.length} surf`);
    set('stage-layers',  `${store.project.layers.length} layers`);
    requestAnimationFrame(infoTick);
  };
  requestAnimationFrame(infoTick);

  // ── Status bar ─────────────────────────────────────────────────────────────
  store.bus.on('UI_STATE_CHANGED', () => {
    const el = document.getElementById('status-surface');
    const s  = store.ui.selectedSurfaceId ? store.getSurface(store.ui.selectedSurfaceId) : null;
    if (el) el.textContent = s
      ? `${s.name} (${s.type}, ${s.points.length}pts)`
      : 'No surface selected';
  });

  store.bus.on('POINT_MOVED', ({ surfaceId, index, point }) => {
    const el = document.getElementById('status-msg');
    if (el) el.textContent = `Point ${index}: (${point.x.toFixed(4)}, ${point.y.toFixed(4)})`;
  });

  // ── Autosave ───────────────────────────────────────────────────────────────
  setInterval(async () => {
    try { await saveProject(store.project); } catch {}
  }, 30_000);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) return; // handled by toolbar or browser
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    // Hotkeys
    switch (e.key) {
      case ' ':
        e.preventDefault();
        document.getElementById('btn-play-pause')?.click();
        break;
      case 'b':
      case 'B':
        document.getElementById('btn-blackout')?.click();
        break;
      case 'f':
      case 'F':
        document.getElementById('btn-freeze')?.click();
        break;
      case 'g':
      case 'G':
        document.getElementById('btn-grid')?.click();
        break;
      case 't':
      case 'T':
        document.getElementById('btn-testcard')?.click();
        break;
      case '1':
        document.getElementById('tool-quad')?.click();
        break;
      case '2':
        document.getElementById('tool-mesh')?.click();
        break;
      case '3':
        document.getElementById('tool-bezier')?.click();
        break;
      case '4':
        document.getElementById('tool-3d')?.click();
        break;
      case 'Delete':
      case 'Backspace': {
        const sId = store.ui.selectedSurfaceId;
        if (sId && store.ui.selectedPointIndex === null) {
          if (confirm('Delete selected surface?')) {
            history.push(store.project);
            store.removeSurface(sId);
          }
        }
        break;
      }
    }

    // Arrow Nudge for Selected Control Point
    const surfId = store.ui.selectedSurfaceId;
    const ptIdx  = store.ui.selectedPointIndex;
    if (surfId && ptIdx !== null) {
      const surface = store.getSurface(surfId);
      if (surface && surface.points[ptIdx]) {
        const step = e.shiftKey ? 0.01 : 0.002;
        const pt = { ...surface.points[ptIdx] };
        let moved = false;
        if (e.key === 'ArrowLeft')  { pt.x -= step; moved = true; }
        if (e.key === 'ArrowRight') { pt.x += step; moved = true; }
        if (e.key === 'ArrowUp')    { pt.y -= step; moved = true; }
        if (e.key === 'ArrowDown')  { pt.y += step; moved = true; }

        if (moved) {
          e.preventDefault();
          pt.x = Math.max(0, Math.min(1, pt.x));
          pt.y = Math.max(0, Math.min(1, pt.y));
          store.movePoint(surfId, ptIdx, pt);
        }
      }
    }
  });

  console.log('%c WebMapper v1.0 ready ', 'background:#6366f1;color:#fff;padding:4px 12px;border-radius:4px;font-weight:700;font-size:14px');
  console.log('Phases shipped: 1-3 (Quad warp, Multi-surface/layers, Polygon mask), 4 (Mesh warp), 5 (Media pipeline + save/load), 6 (Effects engine, 19 shaders), 7 (Scenes), 8 (Audio FFT), 9 (Multi-output), 10 (MIDI), 11 (GLSL editor, calibration, shortcuts)');
}

main().catch(console.error);
