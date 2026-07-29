// ─── WebMapper Pro App Binder & Deep Audit Event Wire-Up ───────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { saveProject, loadProject, exportJSON, importJSON } from '../core/idb';
import { sceneManager } from '../scenes/manager';
import type { RenderEngine } from '../render/engine';
import { DEFAULT_MEDIA_ITEMS } from './media-bin';
import { showToast } from './toast';

export function bindAllAppControls(engine: RenderEngine) {
  const $ = (id: string) => document.getElementById(id);

  // ── 1. Top Bar Menu Items ──────────────────────────────────────────────────
  $('menu-new')?.addEventListener('click', () => {
    history.push(store.project);
    const surfaces = [...store.project.surfaces];
    surfaces.forEach((s) => store.removeSurface(s.id));
    const s = store.addSurface({ type: 'quad' });
    store.selectSurface(s.id);
    showToast('New project created', 'info');
  });

  $('menu-save')?.addEventListener('click', async () => {
    await saveProject(store.project);
    showToast('Project saved successfully!', 'success');
  });

  $('menu-export')?.addEventListener('click', () => {
    exportJSON(store.project);
    showToast('Exported project JSON', 'info');
  });

  $('menu-import')?.addEventListener('click', async () => {
    try {
      const json = await importJSON();
      const ok = store.deserialize(json);
      if (ok) {
        await engine.loadAllMedia();
        showToast('Project imported successfully!', 'success');
      }
    } catch (err) {
      console.error('Import failed', err);
      showToast('Failed to import project file', 'error');
    }
  });

  $('menu-undo')?.addEventListener('click', () => {
    const prev = history.undo();
    if (prev) store.loadProject(prev);
  });

  $('menu-redo')?.addEventListener('click', () => {
    const next = history.redo();
    if (next) store.loadProject(next);
  });

  $('menu-toggle-grid')?.addEventListener('click', () => {
    store.setUI({ showGrid: !store.ui.showGrid });
  });

  $('menu-toggle-testcard')?.addEventListener('click', () => {
    store.setUI({ showTestCard: !store.ui.showTestCard });
  });

  $('menu-fullscreen')?.addEventListener('click', () => {
    engine.requestFullscreen();
  });

  // ── 2. Top Bar Transport & Performance Controls ───────────────────────────
  let isPlaying = true;
  $('btn-play-pause')?.addEventListener('click', () => {
    isPlaying = !isPlaying;
    const btn = $('btn-play-pause');
    if (btn) {
      btn.textContent = isPlaying ? '▶ Play' : '⏸ Pause';
      btn.classList.toggle('active', isPlaying);
    }
    if (isPlaying) engine.start(); else engine.stop();
  });

  $('btn-blackout')?.addEventListener('click', () => {
    store.setUI({ blackout: !store.ui.blackout });
    $('btn-blackout')?.classList.toggle('active', store.ui.blackout);
  });

  $('btn-freeze')?.addEventListener('click', () => {
    store.setUI({ freeze: !store.ui.freeze });
    $('btn-freeze')?.classList.toggle('active', store.ui.freeze);
  });

  const dimmerSlider = $('master-dimmer-slider') as HTMLInputElement | null;
  dimmerSlider?.addEventListener('input', () => {
    const val = parseFloat(dimmerSlider.value);
    store.setUI({ masterDimmer: val });
    const disp = $('dimmer-val');
    if (disp) disp.textContent = `${Math.round(val * 100)}%`;
  });

  let tapTimes: number[] = [];
  $('btn-tap-tempo')?.addEventListener('click', () => {
    const now = performance.now();
    tapTimes.push(now);
    if (tapTimes.length > 8) tapTimes.shift();
    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avg);
      store.setUI({ masterBpm: bpm });
      const disp = $('bpm-display');
      if (disp) disp.textContent = `${bpm}.0 BPM`;
    }
  });

  $('btn-grid')?.addEventListener('click', () => {
    store.setUI({ showGrid: !store.ui.showGrid });
    $('btn-grid')?.classList.toggle('active', store.ui.showGrid);
  });

  $('btn-testcard')?.addEventListener('click', () => {
    store.setUI({ showTestCard: !store.ui.showTestCard });
    $('btn-testcard')?.classList.toggle('active', store.ui.showTestCard);
  });

  $('btn-save')?.addEventListener('click', async () => {
    await saveProject(store.project);
    showToast('Project saved!', 'success');
  });

  $('btn-fullscreen-out')?.addEventListener('click', () => {
    engine.requestFullscreen();
  });

  // ── 3. Mapper Toolbar & Zoom Controls ─────────────────────────────────────
  let zoomLevel = 1.0;
  const updateZoomDisplay = () => {
    const disp = $('zoom-level-val');
    if (disp) disp.textContent = `🔍 ${Math.round(zoomLevel * 100)}%`;
    const stage = $('stage-canvas');
    if (stage) stage.style.transform = `scale(${zoomLevel})`;
  };

  $('btn-zoom-in')?.addEventListener('click', () => { zoomLevel = Math.min(3.0, zoomLevel + 0.15); updateZoomDisplay(); });
  $('btn-zoom-out')?.addEventListener('click', () => { zoomLevel = Math.max(0.4, zoomLevel - 0.15); updateZoomDisplay(); });
  $('btn-zoom-reset')?.addEventListener('click', () => { zoomLevel = 1.0; updateZoomDisplay(); });

  $('btn-snap-toggle')?.addEventListener('click', () => {
    const btn = $('btn-snap-toggle');
    btn?.classList.toggle('active');
  });

  $('btn-reset-perspective')?.addEventListener('click', () => {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const surf = store.getSurface(surfId);
    if (surf && surf.type === 'quad') {
      history.push(store.project);
      store.updateSurface({
        ...surf,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
          { x: 0.8, y: 0.8 },
          { x: 0.2, y: 0.8 },
        ],
      });
    }
  });

  // ── 4. Surface Creation Tool Buttons ──────────────────────────────────────
  const activateShapeTool = (btnId: string, shapeType: 'quad' | 'mesh' | 'model3d') => {
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    $(btnId)?.classList.add('active');
    history.push(store.project);
    const surf = store.addSurface({ type: shapeType });
    store.selectSurface(surf.id);
  };

  $('tool-quad')?.addEventListener('click', () => activateShapeTool('tool-quad', 'quad'));
  $('tool-mesh')?.addEventListener('click', () => activateShapeTool('tool-mesh', 'mesh'));
  $('tool-3d')?.addEventListener('click', () => activateShapeTool('tool-3d', 'model3d'));
  $('tool-bezier')?.addEventListener('click', () => {
    store.setUI({ maskMode: !store.ui.maskMode });
    $('tool-bezier')?.classList.toggle('active', store.ui.maskMode);
  });

  // ── 5. Selected Surface Inspector Controls (Right Panel) ──────────────────
  const surfOpacitySlider = $('surf-opacity') as HTMLInputElement | null;
  surfOpacitySlider?.addEventListener('input', () => {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const layer = store.getLayers(surfId)[0];
    if (layer) {
      const val = parseFloat(surfOpacitySlider.value);
      store.updateLayer({ ...layer, opacity: val });
      const txt = $('surf-opacity-txt');
      if (txt) txt.textContent = `${Math.round(val * 100)}%`;
    }
  });

  const surfBlendSelect = $('surf-blend') as HTMLSelectElement | null;
  surfBlendSelect?.addEventListener('change', () => {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const layer = store.getLayers(surfId)[0];
    if (layer) {
      store.updateLayer({ ...layer, blendMode: surfBlendSelect.value as any });
    }
  });

  // ── 6. Art-Net 4 & Edge Blending Controls ─────────────────────────────────
  let artnetActive = true;
  $('btn-artnet-toggle')?.addEventListener('click', () => {
    artnetActive = !artnetActive;
    const btn = $('btn-artnet-toggle');
    if (btn) {
      btn.textContent = artnetActive ? 'ON' : 'OFF';
      btn.classList.toggle('active', artnetActive);
    }
  });

  // ── 7. Scene Cue Buttons (Bottom Panel) ───────────────────────────────────
  document.querySelectorAll('.cue-btn').forEach((cueBtn) => {
    cueBtn.addEventListener('click', async () => {
      document.querySelectorAll('.cue-btn').forEach((b) => b.classList.remove('active'));
      cueBtn.classList.add('active');
      const idx = parseInt((cueBtn as HTMLElement).dataset.cue ?? '0', 10);
      const targetScene = sceneManager.scenes[idx];
      if (targetScene) {
        await sceneManager.recall(targetScene.id);
      }
    });
  });

  // ── 8. Right-Click Canvas Context Menu ────────────────────────────────────
  const canvasStage = $('canvas-stage-wrapper');
  const ctxMenu = $('canvas-context-menu');

  canvasStage?.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ctxMenu) {
      ctxMenu.style.display = 'block';
      ctxMenu.style.left = `${e.clientX - canvasStage.getBoundingClientRect().left}px`;
      ctxMenu.style.top = `${e.clientY - canvasStage.getBoundingClientRect().top}px`;
    }
  });

  document.addEventListener('click', () => {
    if (ctxMenu) ctxMenu.style.display = 'none';
  });

  $('ctx-duplicate')?.addEventListener('click', () => {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    const surf = store.getSurface(surfId);
    if (surf) {
      history.push(store.project);
      const newSurf = store.addSurface({ type: surf.type, name: `${surf.name} Copy` });
      store.selectSurface(newSurf.id);
    }
  });

  $('ctx-delete')?.addEventListener('click', () => {
    const surfId = store.ui.selectedSurfaceId;
    if (!surfId) return;
    history.push(store.project);
    store.removeSurface(surfId);
  });
}
