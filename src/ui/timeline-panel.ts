// ─── Timeline & Keyframe Animation Panel ────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';

export interface Keyframe {
  timeSec: number;
  value: number;
}

export interface Track {
  id: string;
  layerId: string;
  paramName: string;
  keyframes: Keyframe[];
}

export class TimelinePanel {
  private el: HTMLElement;
  tracks: Track[] = [];
  currentTimeSec = 0;
  durationSec = 10;
  isPlaying = false;
  isLooping = true;
  private animFrameId = 0;
  private lastTime = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'timeline-bar';
    document.body.appendChild(this.el);
    this.render();
  }

  toggleOpen(open?: boolean) {
    const isOpened = open ?? !this.el.classList.contains('open');
    this.el.classList.toggle('open', isOpened);
  }

  private render() {
    this.el.innerHTML = `
      <div class="tl-controls">
        <button class="tb-btn" id="tl-play">${this.isPlaying ? '⏸ Pause' : '▶ Play'}</button>
        <button class="tb-btn" id="tl-stop">⬛ Stop</button>
        <button class="tb-btn ${this.isLooping ? 'active' : ''}" id="tl-loop">🔁 Loop</button>
        <span class="tl-time-disp" id="tl-time-disp">${this.currentTimeSec.toFixed(2)}s / ${this.durationSec}s</span>
        <button class="tb-btn" id="tl-add-kf">⊕ Add Keyframe</button>
        <button class="icon-btn-sm" id="tl-close" style="margin-left:auto">✕</button>
      </div>
      <div class="tl-scrubber-wrap" id="tl-scrubber-wrap">
        <div class="tl-playhead" id="tl-playhead" style="left:0%"></div>
        <div class="tl-tracks" id="tl-tracks">
          ${this.tracks.length === 0
            ? `<div style="font-size:11px;color:var(--clr-text-muted);padding:8px">No animation tracks. Select a layer parameter and click <strong>⊕ Add Keyframe</strong>.</div>`
            : this.tracks.map((tr) => this.trackRow(tr)).join('')}
        </div>
      </div>
    `;

    document.getElementById('tl-close')?.addEventListener('click', () => this.toggleOpen(false));

    document.getElementById('tl-play')?.addEventListener('click', () => {
      this.isPlaying = !this.isPlaying;
      if (this.isPlaying) this.startPlayback(); else this.stopPlayback();
      this.render();
    });

    document.getElementById('tl-stop')?.addEventListener('click', () => {
      this.stopPlayback();
      this.currentTimeSec = 0;
      this.updatePlayheadUI();
      this.render();
    });

    document.getElementById('tl-loop')?.addEventListener('click', () => {
      this.isLooping = !this.isLooping;
      this.render();
    });

    document.getElementById('tl-add-kf')?.addEventListener('click', () => {
      const layerId = store.ui.selectedLayerId;
      if (!layerId) return;
      const layer = store.project.layers.find((l) => l.id === layerId);
      if (!layer) return;

      let tr = this.tracks.find((t) => t.layerId === layerId && t.paramName === 'opacity');
      if (!tr) {
        tr = { id: Math.random().toString(36).slice(2), layerId, paramName: 'opacity', keyframes: [] };
        this.tracks.push(tr);
      }

      history.push(store.project);
      tr.keyframes.push({ timeSec: this.currentTimeSec, value: layer.opacity });
      tr.keyframes.sort((a, b) => a.timeSec - b.timeSec);
      this.render();
    });

    const wrap = document.getElementById('tl-scrubber-wrap');
    wrap?.addEventListener('click', (e) => {
      const rect = wrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.currentTimeSec = pct * this.durationSec;
      this.updatePlayheadUI();
      this.evaluateTracks();
    });
  }

  private trackRow(tr: Track): string {
    const layer = store.project.layers.find((l) => l.id === tr.layerId);
    return `
      <div class="tl-track-row">
        <span class="tl-track-label">${layer?.name ?? 'Layer'} · ${tr.paramName}</span>
        <div class="tl-track-timeline">
          ${tr.keyframes.map((kf) => `
            <div class="tl-kf-node" style="left:${(kf.timeSec / this.durationSec) * 100}%" title="${kf.timeSec.toFixed(2)}s: ${kf.value.toFixed(2)}"></div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private startPlayback() {
    this.lastTime = performance.now();
    const tick = () => {
      if (!this.isPlaying) return;
      const now = performance.now();
      const dt = (now - this.lastTime) / 1000;
      this.lastTime = now;

      this.currentTimeSec += dt;
      if (this.currentTimeSec >= this.durationSec) {
        if (this.isLooping) this.currentTimeSec %= this.durationSec;
        else { this.currentTimeSec = this.durationSec; this.isPlaying = false; }
      }

      this.updatePlayheadUI();
      this.evaluateTracks();
      this.animFrameId = requestAnimationFrame(tick);
    };
    this.animFrameId = requestAnimationFrame(tick);
  }

  private stopPlayback() {
    this.isPlaying = false;
    cancelAnimationFrame(this.animFrameId);
  }

  private updatePlayheadUI() {
    const pct = (this.currentTimeSec / this.durationSec) * 100;
    const ph = document.getElementById('tl-playhead');
    if (ph) ph.style.left = `${pct}%`;
    const disp = document.getElementById('tl-time-disp');
    if (disp) disp.textContent = `${this.currentTimeSec.toFixed(2)}s / ${this.durationSec}s`;
  }

  private evaluateTracks() {
    for (const tr of this.tracks) {
      if (tr.keyframes.length === 0) continue;
      const val = this.interpolateTrack(tr, this.currentTimeSec);
      const layer = store.project.layers.find((l) => l.id === tr.layerId);
      if (layer && tr.paramName === 'opacity') {
        store.updateLayer({ ...layer, opacity: val });
      }
    }
  }

  private interpolateTrack(tr: Track, t: number): number {
    const kfs = tr.keyframes;
    if (t <= kfs[0].timeSec) return kfs[0].value;
    if (t >= kfs[kfs.length - 1].timeSec) return kfs[kfs.length - 1].value;

    for (let i = 0; i < kfs.length - 1; i++) {
      if (t >= kfs[i].timeSec && t <= kfs[i + 1].timeSec) {
        const factor = (t - kfs[i].timeSec) / (kfs[i + 1].timeSec - kfs[i].timeSec);
        return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * factor;
      }
    }
    return kfs[0].value;
  }
}
