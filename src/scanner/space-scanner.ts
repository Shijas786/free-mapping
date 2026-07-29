// ─── Space Scanner — Structured Light 3D Projector-Camera Calibration ─────────
import { generateGrayCodePatterns, grayToBinary } from './gray-code';

export interface ScanProgress {
  step: number;
  totalSteps: number;
  status: string;
}

export class SpaceScanner {
  private videoEl: HTMLVideoElement | null = null;
  private cameraStream: MediaStream | null = null;
  scanning = false;

  async startCamera(): Promise<HTMLVideoElement> {
    if (!this.cameraStream) {
      this.cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      this.videoEl = document.createElement('video');
      this.videoEl.srcObject = this.cameraStream;
      this.videoEl.muted = true;
      this.videoEl.playsInline = true;
      await this.videoEl.play();
    }
    return this.videoEl!;
  }

  stopCamera() {
    this.cameraStream?.getTracks().forEach((t) => t.stop());
    this.cameraStream = null;
    this.videoEl = null;
  }

  /**
   * Run full Space Scanner sequence:
   * Projects binary Gray code patterns, captures video frames, decodes camera-to-projector pixel coordinates.
   */
  async runScan(
    projCanvas: HTMLCanvasElement,
    onProgress: (p: ScanProgress) => void
  ): Promise<HTMLCanvasElement> {
    this.scanning = true;
    const video = await this.startCamera();
    const bits = 8;
    const W = projCanvas.width;
    const H = projCanvas.height;

    const patterns = generateGrayCodePatterns(W, H, bits);
    const total = patterns.length;

    const camW = video.videoWidth || 640;
    const camH = video.videoHeight || 480;

    const capturedFrames: ImageData[] = [];
    const ctxProj = projCanvas.getContext('2d')!;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = camW; tempCanvas.height = camH;
    const tempCtx = tempCanvas.getContext('2d')!;

    // 1. Projection & Capture Loop
    for (let i = 0; i < patterns.length; i++) {
      if (!this.scanning) throw new Error('Scan cancelled');

      const pat = patterns[i];
      onProgress({
        step: i + 1,
        totalSteps: total,
        status: `Projecting pattern ${i + 1}/${total} (${pat.isVertical ? 'V' : 'H'}-bit ${pat.bit}${pat.inverted ? ' inv' : ''})`,
      });

      // Project pattern
      ctxProj.drawImage(pat.canvas, 0, 0, W, H);

      // Wait 120ms for projector latency & camera exposure
      await new Promise((res) => setTimeout(res, 120));

      // Capture camera frame
      tempCtx.drawImage(video, 0, 0, camW, camH);
      capturedFrames.push(tempCtx.getImageData(0, 0, camW, camH));
    }

    // 2. Decode Gray Code to construct Projector POV map
    onProgress({ step: total, totalSteps: total, status: 'Decoding Gray code pixel map...' });

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = camW; resultCanvas.height = camH;
    const resCtx = resultCanvas.getContext('2d')!;
    const resImgData = resCtx.createImageData(camW, camH);
    const resData = resImgData.data;

    // Decode per camera pixel
    const N = camW * camH;
    for (let p = 0; p < N; p++) {
      let grayX = 0;
      let grayY = 0;

      for (let bit = 0; bit < bits; bit++) {
        const normalIdx = bit * 2;
        const invIdx = bit * 2 + 1;

        const valNorm = capturedFrames[normalIdx].data[p * 4];
        const valInv  = capturedFrames[invIdx].data[p * 4];

        const bitVal = valNorm > valInv ? 1 : 0;
        grayX = (grayX << 1) | bitVal;
      }

      for (let bit = 0; bit < bits; bit++) {
        const normalIdx = bits * 2 + bit * 2;
        const invIdx = bits * 2 + bit * 2 + 1;

        const valNorm = capturedFrames[normalIdx].data[p * 4];
        const valInv  = capturedFrames[invIdx].data[p * 4];

        const bitVal = valNorm > valInv ? 1 : 0;
        grayY = (grayY << 1) | bitVal;
      }

      const binX = grayToBinary(grayX);
      const binY = grayToBinary(grayY);

      const projXNorm = binX / (1 << bits);
      const projYNorm = binY / (1 << bits);

      const px = p * 4;
      resData[px]     = Math.floor(projXNorm * 255); // R = X coord
      resData[px + 1] = Math.floor(projYNorm * 255); // G = Y coord
      resData[px + 2] = 128;                         // B
      resData[px + 3] = 255;                         // A
    }

    resCtx.putImageData(resImgData, 0, 0);
    this.scanning = false;
    onProgress({ step: total, totalSteps: total, status: 'Scan Complete! Projector POV generated.' });

    return resultCanvas;
  }
}

export const spaceScanner = new SpaceScanner();
