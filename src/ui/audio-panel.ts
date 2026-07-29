// ─── Audio Panel — FFT + parameter bindings ──────────────────────────────────
import { store } from '../core/store';
import { audioAnalyser } from '../audio/analyser';
import { generateId } from '../core/utils';
import { history } from '../core/history';
import type { AudioBinding } from '../core/types';

export class AudioPanel {
  private el: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private animId = 0;
  private running = false;

  constructor() {
    this.el = document.getElementById('audio-panel')!;
    this.render();
    store.bus.on('UI_STATE_CHANGED', () => {});
    store.bus.on('PROJECT_LOADED',   () => this.render());
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header"><span class="panel-title">Audio Reactivity</span></div>

      <div class="audio-controls">
        <button id="audio-mic-btn" class="tb-btn">🎤 Mic Input</button>
        <button id="audio-stop-btn" class="tb-btn">⬛ Stop</button>
        <span id="audio-status" class="audio-status-badge">Stopped</span>
      </div>

      <canvas id="fft-canvas" width="240" height="60" class="fft-canvas"></canvas>
      <div id="audio-amp-bar" class="audio-amp-bar"><div class="audio-amp-fill" id="amp-fill"></div></div>

      <div class="panel-header" style="margin-top:8px">
        <span class="panel-title" style="font-size:10px">Parameter Bindings</span>
        <button class="icon-btn" id="add-binding-btn" title="Add binding">＋</button>
      </div>

      <div class="binding-list" id="binding-list">
        ${store.project.audioBindings.map((b) => this.bindingItem(b)).join('')}
        ${store.project.audioBindings.length === 0
          ? `<div class="panel-empty" style="padding:12px;font-size:11px">No bindings yet</div>` : ''}
      </div>
    `;

    this.canvas = document.getElementById('fft-canvas') as HTMLCanvasElement;
    this.ctx2d  = this.canvas.getContext('2d')!;

    document.getElementById('audio-mic-btn')?.addEventListener('click', async () => {
      await audioAnalyser.startMic();
      document.getElementById('audio-status')!.textContent = '● Live';
      document.getElementById('audio-status')!.style.color = '#4ade80';
      this.startViz();
    });

    document.getElementById('audio-stop-btn')?.addEventListener('click', () => {
      audioAnalyser.stopMic();
      this.stopViz();
      document.getElementById('audio-status')!.textContent = 'Stopped';
      document.getElementById('audio-status')!.style.color = '';
    });

    document.getElementById('add-binding-btn')?.addEventListener('click', () => {
      const layer = store.project.layers[0];
      if (!layer) return;
      history.push(store.project);
      const binding: AudioBinding = {
        id: generateId(),
        targetLayerId: layer.id,
        targetParam: 'opacity',
        fftBand: [0, 16],
        sensitivity: 1.5,
        smoothing: 0.8,
        min: 0,
        max: 1,
      };
      store.project.audioBindings.push(binding);
      store.bus.emit({ type: 'PROJECT_LOADED', project: store.project });
      this.render();
    });

    // Binding controls
    store.project.audioBindings.forEach((b) => {
      const row = document.getElementById(`binding-${b.id}`);
      if (!row) return;

      row.querySelector('.binding-delete')?.addEventListener('click', () => {
        history.push(store.project);
        store.project.audioBindings = store.project.audioBindings.filter((x) => x.id !== b.id);
        this.render();
      });

      const sensEl = row.querySelector('.binding-sens') as HTMLInputElement;
      sensEl?.addEventListener('input', () => {
        b.sensitivity = parseFloat(sensEl.value);
      });
    });
  }

  private bindingItem(b: AudioBinding): string {
    const layer = store.project.layers.find((l) => l.id === b.targetLayerId);
    return `
      <div class="binding-row" id="binding-${b.id}">
        <div class="binding-info">
          <span class="binding-layer">${layer?.name ?? '?'}</span>
          <span class="binding-arrow">→</span>
          <span class="binding-param">${b.targetParam}</span>
          <span class="binding-band">Hz:[${b.fftBand[0]}-${b.fftBand[1]}]</span>
        </div>
        <div class="binding-controls">
          <label style="font-size:10px">Sens</label>
          <input type="range" class="binding-sens" min="0.1" max="5" step="0.1" value="${b.sensitivity}"
            style="width:70px;height:3px">
          <button class="binding-delete icon-btn-sm danger">✕</button>
        </div>
      </div>
    `;
  }

  private startViz() {
    if (this.running) return;
    this.running = true;
    const draw = () => {
      if (!this.running || !this.ctx2d || !this.canvas) return;
      const bins = audioAnalyser.bins;
      const W = this.canvas.width;
      const H = this.canvas.height;
      this.ctx2d.clearRect(0, 0, W, H);

      const barW = W / bins.length;
      for (let i = 0; i < bins.length; i++) {
        const bh = bins[i] * H;
        const hue = 240 - i * (200 / bins.length);
        this.ctx2d.fillStyle = `hsla(${hue},90%,60%,0.85)`;
        this.ctx2d.fillRect(i * barW, H - bh, barW - 0.5, bh);
      }

      const ampFill = document.getElementById('amp-fill');
      if (ampFill) ampFill.style.width = `${audioAnalyser.amplitude * 100}%`;

      this.animId = requestAnimationFrame(draw);
    };
    this.animId = requestAnimationFrame(draw);
  }

  private stopViz() {
    this.running = false;
    cancelAnimationFrame(this.animId);
  }
}
