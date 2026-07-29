// ─── Audio Analyser — Web Audio FFT + parameter binding ──────────────────────
import { store } from '../core/store';
import type { AudioBinding } from '../core/types';

export class AudioAnalyser {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  private fftData: Uint8Array = new Uint8Array(0);
  private smoothed: Float32Array = new Float32Array(256);
  private stream: MediaStream | null = null;
  running = false;

  /** Live FFT values [0,1] per bin after smoothing */
  get bins(): Float32Array { return this.smoothed; }

  /** Overall RMS amplitude [0,1] */
  get amplitude(): number {
    let sum = 0;
    for (let i = 0; i < this.smoothed.length; i++) sum += this.smoothed[i] ** 2;
    return Math.sqrt(sum / this.smoothed.length);
  }

  async startMic(): Promise<void> {
    await this.ensureContext();
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    this.source = this.ctx!.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser!);
    this.running = true;
  }

  connectElement(el: HTMLMediaElement): void {
    this.ensureContext();
    try {
      this.source = this.ctx!.createMediaElementSource(el);
      this.source.connect(this.analyser!);
      this.source.connect(this.ctx!.destination);
    } catch { /* already connected */ }
    this.running = true;
  }

  stopMic(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.source?.disconnect();
    this.source = null;
    this.running = false;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;
      this.fftData = new Uint8Array(this.analyser.frequencyBinCount);
      this.smoothed = new Float32Array(this.analyser.frequencyBinCount);
    }
    return this.ctx!;
  }

  /**
   * Called every frame from the render loop.
   * Updates smoothed FFT bins and applies all audio bindings to store state.
   */
  tick(): void {
    if (!this.analyser || !this.running) return;

    this.analyser.getByteFrequencyData(this.fftData);
    const N = this.fftData.length;

    for (let i = 0; i < N; i++) {
      const raw = this.fftData[i] / 255;
      const sm  = this.analyser.smoothingTimeConstant;
      this.smoothed[i] = this.smoothed[i] * sm + raw * (1 - sm);
    }

    // Apply bindings
    for (const binding of store.project.audioBindings) {
      const value = this.getBandValue(binding);
      this.applyBinding(binding, value);
    }
  }

  getBandValue(binding: AudioBinding): number {
    const [start, end] = binding.fftBand;
    let sum = 0;
    const count = Math.max(1, end - start);
    for (let i = start; i < end && i < this.smoothed.length; i++) sum += this.smoothed[i];
    const raw = sum / count;
    return binding.min + (binding.max - binding.min) * Math.min(1, raw * binding.sensitivity);
  }

  private applyBinding(binding: AudioBinding, value: number): void {
    const layer = store.project.layers.find((l) => l.id === binding.targetLayerId);
    if (!layer) return;

    if (binding.targetEffectId) {
      const eff = layer.effects.find((e) => e.id === binding.targetEffectId);
      if (eff) eff.params[binding.targetParam] = value;
    } else {
      switch (binding.targetParam) {
        case 'opacity': layer.opacity = Math.max(0, Math.min(1, value)); break;
      }
    }
  }

  getFrequencyForBin(bin: number): number {
    if (!this.ctx || !this.analyser) return 0;
    return (bin / this.analyser.frequencyBinCount) * (this.ctx.sampleRate / 2);
  }

  getBinForHz(hz: number): number {
    if (!this.ctx || !this.analyser) return 0;
    return Math.round((hz / (this.ctx.sampleRate / 2)) * this.analyser.frequencyBinCount);
  }

  dispose(): void {
    this.stopMic();
    this.ctx?.close();
    this.ctx = null;
  }
}

export const audioAnalyser = new AudioAnalyser();
