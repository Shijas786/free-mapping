// ─── 3D Model & Virtual Camera Calibration Engine ────────────────────────────
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export interface CameraPose3D {
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number; // degrees
  fov: number; // degrees
}

export class Model3DEngine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  meshGroup: THREE.Group;

  constructor(width = 1280, height = 720) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    // Ambient + Directional lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.6);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 5);
    this.scene.add(amb, dir);

    const canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setSize(width, height);
  }

  /**
   * Load an OBJ 3D model from URL or string data.
   */
  async loadOBJ(urlOrData: string, isUrl = true): Promise<void> {
    const loader = new OBJLoader();
    let obj: THREE.Group;

    if (isUrl) {
      obj = await new Promise((res, rej) => loader.load(urlOrData, res, undefined, rej));
    } else {
      obj = loader.parse(urlOrData);
    }

    // Clear existing meshes
    while (this.meshGroup.children.length) this.meshGroup.remove(this.meshGroup.children[0]);

    // Apply default wireframe/flat material for calibration visualization
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
          color: 0x6366f1,
          wireframe: false,
          roughness: 0.4,
        });
      }
    });

    this.meshGroup.add(obj);
  }

  /**
   * Position the virtual camera to match the real projector pose.
   */
  setCameraPose(pose: CameraPose3D, aspect = 16 / 9) {
    this.camera.fov = pose.fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.camera.position.set(pose.posX, pose.posY, pose.posZ);
    this.camera.rotation.set(
      THREE.MathUtils.degToRad(pose.rotX),
      THREE.MathUtils.degToRad(pose.rotY),
      THREE.MathUtils.degToRad(pose.rotZ)
    );
  }

  renderToCanvas(w: number, h: number): HTMLCanvasElement {
    this.renderer.setSize(w, h);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }
}

export const model3dEngine = new Model3DEngine();
