// ─── LFO Oscillator Engine ────────────────────────────────────────────────────
import { store } from './store';

export type LFOWaveform = 'sine' | 'square' | 'saw' | 'triangle' | 'random';

export interface LFOBinding {
  id: string;
  name: string;
  waveform: LFOWaveform;
  frequency: number; // Hz (0.01 - 20 Hz)
  depth: number;     // 0 - 1
  offset: number;    // phase offset 0 - 1
  min: number;
  max: number;
  targetLayerId: string;
  targetEffectId?: string;
  targetParam: string;
  enabled: boolean;
}

export class LFOEngine {
  bindings: LFOBinding[] = [];

  /**
   * Evaluate waveform value in range [0, 1] at current time (in seconds).
   */
  evaluate(b: LFOBinding, timeSec: number): number {
    if (!b.enabled) return 0;
    const phase = (timeSec * b.frequency + b.offset) % 1.0;
    let raw = 0;

    switch (b.waveform) {
      case 'sine':
        raw = (Math.sin(phase * Math.PI * 2) + 1) / 2;
        break;
      case 'square':
        raw = phase < 0.5 ? 1 : 0;
        break;
      case 'saw':
        raw = phase;
        break;
      case 'triangle':
        raw = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
        break;
      case 'random':
        // Sample-and-hold pseudo random
        const seed = Math.floor(timeSec * b.frequency + b.offset);
        raw = (Math.sin(seed * 12.9898 + 78.233) * 43758.5453) % 1.0;
        raw = Math.abs(raw);
        break;
    }

    // Scale by depth and map to min/max
    const val = raw * b.depth;
    return b.min + (b.max - b.min) * val;
  }

  /**
   * Tick step called on every frame. Applies LFO output values to store parameters.
   */
  tick(timeSec: number) {
    for (const b of this.bindings) {
      if (!b.enabled) continue;
      const value = this.evaluate(b, timeSec);
      const layer = store.project.layers.find((l) => l.id === b.targetLayerId);
      if (!layer) continue;

      if (b.targetEffectId) {
        const eff = layer.effects.find((e) => e.id === b.targetEffectId);
        if (eff) eff.params[b.targetParam] = value;
      } else {
        if (b.targetParam === 'opacity') layer.opacity = Math.max(0, Math.min(1, value));
      }
    }
  }
}

export const lfoEngine = new LFOEngine();
