// ─── MIDI Panel — Web MIDI API bindings ──────────────────────────────────────
import { store } from '../core/store';

interface MIDIBinding {
  id: string;
  channel: number;
  controller: number;
  targetLayerId: string;
  targetParam: string;
  min: number;
  max: number;
}

class MIDIBridge {
  private access: MIDIAccess | null = null;
  bindings: MIDIBinding[] = [];
  private lastCC = new Map<string, number>();

  async init(): Promise<boolean> {
    if (!navigator.requestMIDIAccess) return false;
    try {
      this.access = await navigator.requestMIDIAccess();
      this.access.inputs.forEach((input) => {
        input.onmidimessage = (e) => this.onMessage(e);
      });
      this.access.onstatechange = () => {
        this.access!.inputs.forEach((input) => {
          input.onmidimessage = (e) => this.onMessage(e);
        });
      };
      return true;
    } catch {
      return false;
    }
  }

  private onMessage(e: MIDIMessageEvent) {
    if (!e.data) return;
    const data0 = e.data[0]; const data1 = e.data[1]; const data2 = e.data[2];
    const type = data0 & 0xF0;
    const ch   = data0 & 0x0F;
    if (type !== 0xB0) return; // only CC

    const key = `${ch}:${data1}`;
    this.lastCC.set(key, data2);

    const value = data2 / 127;
    for (const b of this.bindings) {
      if (b.channel === ch && b.controller === data1) {
        const mapped = b.min + (b.max - b.min) * value;
        const layer = store.project.layers.find((l) => l.id === b.targetLayerId);
        if (layer && b.targetParam === 'opacity') {
          store.updateLayer({ ...layer, opacity: mapped });
        }
      }
    }
  }

  getInputs(): string[] {
    if (!this.access) return [];
    return [...this.access.inputs.values()].map((i) => i.name ?? '?');
  }

  getLastCC(ch: number, cc: number): number {
    return this.lastCC.get(`${ch}:${cc}`) ?? 0;
  }
}

export const midiBridge = new MIDIBridge();

export class MIDIPanel {
  private el: HTMLElement;

  constructor() {
    this.el = document.getElementById('midi-panel')!;
    this.render();
  }

  private render() {
    this.el.innerHTML = `
      <div class="panel-header"><span class="panel-title">MIDI Control</span></div>

      <div class="audio-controls">
        <button class="tb-btn" id="midi-init-btn">🎹 Enable MIDI</button>
        <span id="midi-status" class="audio-status-badge">Not connected</span>
      </div>

      <div id="midi-inputs-list" style="padding:8px;font-size:11px;color:var(--clr-text-muted)">
        —
      </div>

      <div class="panel-header">
        <span class="panel-title" style="font-size:10px">CC Bindings</span>
        <button class="icon-btn" id="add-midi-binding" title="Add binding">＋</button>
      </div>

      <div class="binding-list" id="midi-binding-list">
        ${midiBridge.bindings.map((b) => this.bindingRow(b)).join('')}
        ${midiBridge.bindings.length === 0
          ? `<div class="panel-empty" style="padding:12px;font-size:11px">No MIDI bindings</div>` : ''}
      </div>

      <div style="padding:8px;border-top:1px solid var(--clr-border)">
        <div class="props-label">Learn Mode</div>
        <div style="font-size:11px;color:var(--clr-text-muted);line-height:1.5;margin-top:4px">
          Move a MIDI controller to auto-detect the CC number.
          Last CC: <span id="midi-last-cc" style="font-family:var(--font-mono);color:var(--clr-accent-2)">—</span>
        </div>
      </div>
    `;

    document.getElementById('midi-init-btn')?.addEventListener('click', async () => {
      const ok = await midiBridge.init();
      const statusEl = document.getElementById('midi-status')!;
      const inputsEl = document.getElementById('midi-inputs-list')!;
      if (ok) {
        statusEl.textContent = '● Connected'; statusEl.style.color = '#4ade80';
        const inputs = midiBridge.getInputs();
        inputsEl.innerHTML = inputs.length
          ? inputs.map((n) => `<div>🎹 ${n}</div>`).join('')
          : '<div>No MIDI devices found</div>';
      } else {
        statusEl.textContent = 'Not supported';
      }
    });
  }

  private bindingRow(b: MIDIBinding): string {
    return `
      <div class="binding-row">
        <span>CH${b.channel + 1} CC${b.controller} → ${b.targetParam}</span>
        <span style="font-size:10px;font-family:var(--font-mono)">${b.min}–${b.max}</span>
      </div>
    `;
  }
}
