// ─── Scene / Preset manager ───────────────────────────────────────────────────
import { store } from '../core/store';
import { saveProject, loadProject } from '../core/idb';
import { clone } from '../core/utils';
import type { Project } from '../core/types';

export interface Scene {
  id: string;
  name: string;
  thumbnail?: string;    // base64 data-URL snapshot
  snapshot: Project;
  createdAt: string;
}

/** In-memory list of scenes — also persisted to IndexedDB under scene keys. */
class SceneManager {
  scenes: Scene[] = [];

  async capture(name: string, canvas?: HTMLCanvasElement): Promise<Scene> {
    const scene: Scene = {
      id: Math.random().toString(36).slice(2),
      name,
      snapshot: clone(store.project),
      createdAt: new Date().toISOString(),
      thumbnail: canvas?.toDataURL('image/jpeg', 0.5),
    };
    this.scenes.push(scene);
    await saveProject(scene.snapshot, `scene:${scene.id}`);
    return scene;
  }

  async recall(sceneId: string): Promise<void> {
    const scene = this.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    store.loadProject(clone(scene.snapshot));
  }

  async loadAll(): Promise<void> {
    // IDB keys starting with "scene:" are scenes
    const { listProjectKeys, loadProject: loadFromIDB } = await import('../core/idb');
    const keys = (await listProjectKeys()).filter((k) => k.startsWith('scene:'));
    for (const key of keys) {
      const snap = await loadFromIDB(key);
      if (snap) {
        const id = key.replace('scene:', '');
        if (!this.scenes.find((s) => s.id === id)) {
          this.scenes.push({
            id,
            name: snap.meta.name,
            snapshot: snap,
            createdAt: snap.meta.createdAt,
          });
        }
      }
    }
  }

  async remove(sceneId: string): Promise<void> {
    const { deleteProject } = await import('../core/idb');
    this.scenes = this.scenes.filter((s) => s.id !== sceneId);
    await deleteProject(`scene:${sceneId}`);
  }

  /** Blend two project snapshots — cross-fade opacities & params. */
  blend(fromScene: Scene, toScene: Scene, t: number): void {
    const fl = fromScene.snapshot.layers;
    const tl = toScene.snapshot.layers;
    store.project.layers.forEach((layer, i) => {
      const f = fl[i];
      const to = tl[i];
      if (!f || !to) return;
      layer.opacity = f.opacity * (1 - t) + to.opacity * t;
    });
    store.bus.emit({ type: 'LAYER_UPDATED', layer: store.project.layers[0] });
  }
}

export const sceneManager = new SceneManager();
