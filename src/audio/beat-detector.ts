// ─── Audio BPM & Beat Detector ───────────────────────────────────────────────

export class BeatDetector {
  bpm = 120;
  isBeat = false;
  private energyHistory: number[] = [];
  private lastBeatTime = 0;
  private tapTimes: number[] = [];

  /**
   * Process current frame audio amplitude [0, 1] to detect beat transients.
   */
  process(amplitude: number, nowSec: number): boolean {
    this.energyHistory.push(amplitude);
    if (this.energyHistory.length > 40) this.energyHistory.shift();

    const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
    const isTransient = amplitude > avgEnergy * 1.35 && (nowSec - this.lastBeatTime) > (60 / 220);

    if (isTransient) {
      this.isBeat = true;
      this.lastBeatTime = nowSec;
    } else {
      this.isBeat = false;
    }
    return this.isBeat;
  }

  /**
   * Manual Tap Tempo calculation.
   */
  tapTempo() {
    const now = performance.now();
    this.tapTimes.push(now);
    if (this.tapTimes.length > 8) this.tapTimes.shift();

    if (this.tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
      }
      const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      this.bpm = Math.round(60000 / avgIntervalMs);
    }
  }
}

export const beatDetector = new BeatDetector();
