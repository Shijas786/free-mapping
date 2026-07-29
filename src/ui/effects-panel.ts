// ─── Effects Panel ────────────────────────────────────────────────────────────
import { store } from '../core/store';
import { history } from '../core/history';
import { generateId } from '../core/utils';
import { EFFECT_DEFS, EFFECT_DEF_MAP } from '../render/effects/library';
import type { Effect, EffectType } from '../core/types';

const CATEGORY_ICONS: Record<string, string> = {
  color: '🎨', distortion: '🌀', blur: '💫', stylize: '✦', generative: '⚡',
};

export class EffectsPanel {
  private el: HTMLElement;

  constructor() {
    this.el = document.getElementById('effects-panel')!;
    if (!this.el) return;
    this.render();
    store.bus.on('LAYER_UPDATED',   () => this.render());
    store.bus.on('UI_STATE_CHANGED',() => this.render());
    store.bus.on('PROJECT_LOADED',  () => this.render());
  }

  private render() {
    const layerId = store.ui.selectedLayerId;
    const layer   = layerId ? store.project.layers.find((l) => l.id === layerId) : null;

    if (!layer) {
      this.el.innerHTML = `
        <div class="panel-header"><span class="panel-title">Effects</span></div>
        <div class="panel-empty"><p>Select a layer to add effects</p></div>`;
      return;
    }

    // Group library by category
    const cats = [...new Set(EFFECT_DEFS.map((d) => d.category))];

    this.el.innerHTML = `
      <div class="panel-header">
        <span class="panel-title">Effects — ${layer.name}</span>
      </div>

      <!-- Applied effects stack -->
      <div class="fx-applied" id="fx-applied">
        ${layer.effects.length === 0
          ? `<div class="fx-empty">No effects. Add from library below.</div>`
          : layer.effects.map((e) => this.fxItem(e, layer.id)).join('')
        }
      </div>

      <div class="fx-library-header">
        <span class="panel-title" style="font-size:10px">Effect Library</span>
      </div>
      <div class="fx-library" id="fx-library">
        ${cats.map((cat) => `
          <div class="fx-cat-label">${CATEGORY_ICONS[cat] ?? '▸'} ${cat}</div>
          ${EFFECT_DEFS.filter((d) => d.category === cat).map((d) => `
            <button class="fx-lib-btn" data-type="${d.type}" title="${d.label}">
              ${d.label}
            </button>
          `).join('')}
        `).join('')}
      </div>
    `;

    // Add effect buttons
    this.el.querySelectorAll<HTMLButtonElement>('.fx-lib-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const def = EFFECT_DEF_MAP.get(btn.dataset.type!)!;
        const effect: Effect = {
          id: generateId(),
          type: btn.dataset.type! as EffectType,
          enabled: true,
          params: Object.fromEntries(Object.entries(def.params).map(([k, v]) => [k, v.default])),
        };
        history.push(store.project);
        store.updateLayer({ ...layer, effects: [...layer.effects, effect] });
      });
    });

    // Per-effect controls
    layer.effects.forEach((eff) => {
      const effEl = document.getElementById(`fx-item-${eff.id}`);
      if (!effEl) return;

      effEl.querySelector('.fx-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        store.updateLayer({ ...layer, effects: layer.effects.map((ef) =>
          ef.id === eff.id ? { ...ef, enabled: !ef.enabled } : ef
        )});
      });

      effEl.querySelector('.fx-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        history.push(store.project);
        store.updateLayer({ ...layer, effects: layer.effects.filter((ef) => ef.id !== eff.id) });
      });

      effEl.querySelectorAll<HTMLInputElement>('.fx-param-slider').forEach((slider) => {
        const param = slider.dataset.param!;
        slider.addEventListener('input', () => {
          store.updateLayer({ ...layer, effects: layer.effects.map((ef) =>
            ef.id === eff.id ? { ...ef, params: { ...ef.params, [param]: parseFloat(slider.value) } } : ef
          )});
        });
      });
    });
  }

  private fxItem(eff: Effect, layerId: string): string {
    const def = EFFECT_DEF_MAP.get(eff.type);
    if (!def) return '';
    const params = Object.entries(def.params);

    return `
      <div class="fx-item ${eff.enabled ? '' : 'fx-disabled'}" id="fx-item-${eff.id}">
        <div class="fx-item-header">
          <span class="fx-cat-dot" title="${def.category}">${CATEGORY_ICONS[def.category] ?? '▸'}</span>
          <span class="fx-name">${def.label}</span>
          <button class="fx-toggle icon-btn-sm" title="Toggle">${eff.enabled ? '◉' : '○'}</button>
          <button class="fx-delete icon-btn-sm danger" title="Remove">✕</button>
        </div>
        ${eff.enabled ? `
        <div class="fx-params">
          ${params.map(([name, meta]) => `
            <div class="fx-param-row">
              <label title="${name}">${meta.label}</label>
              <input type="range" class="fx-param-slider"
                data-param="${name}"
                min="${meta.min}" max="${meta.max}"
                step="${meta.step ?? 0.01}"
                value="${eff.params[name] ?? meta.default}">
              <span class="fx-val">${(eff.params[name] ?? meta.default).toFixed(2)}</span>
            </div>
          `).join('')}
        </div>` : ''}
      </div>
    `;
  }
}
