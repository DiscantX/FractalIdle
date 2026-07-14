import type { SettingDefinition, SettingsState, SettingChangeApi, SettingValue } from './types';
import { SECTIONS, coreSettings } from './registry';
import { enforceRangeLink } from './rangeLink';

export interface SettingsEngineHost {
  requestRender: () => void;
  syncCanvasSize: () => void;
}

type ControlRefs =
  | { kind: 'slider'; range: HTMLInputElement; number: HTMLInputElement }
  | { kind: 'number'; input: HTMLInputElement }
  | { kind: 'checkbox'; input: HTMLInputElement }
  | { kind: 'select'; select: HTMLSelectElement };

export class SettingsEngine {
  private readonly registry: SettingDefinition[];
  private readonly state: SettingsState;
  private readonly controlRefs = new Map<string, ControlRefs>();
  private readonly fieldWrappers = new Map<string, HTMLElement>();
  private readonly host: SettingsEngineHost;

  constructor(host: SettingsEngineHost, registry: SettingDefinition[] = coreSettings) {
    this.host = host;
    this.registry = registry;
    this.state = {};
    for (const setting of registry) {
      this.state[setting.id] = setting.default;
    }
  }

  getValue = (id: string): SettingValue => this.state[id];

  /** Full read-only snapshot — used by the worker payload builder (Slice 4). */
  getSnapshot(): SettingsState {
    return { ...this.state };
  }

  setValue = (id: string, value: SettingValue): void => {
    this.state[id] = value;
    this.syncControlDisplay(id);
    this.refreshVisibility();
  };

  mount(container: HTMLElement): void {
    container.innerHTML = '';
    for (const section of SECTIONS) {
      const sectionSettings = this.registry.filter((s) => s.section === section.id);
      if (sectionSettings.length === 0) continue;

      const sectionEl = document.createElement('section');
      sectionEl.className = 'control-section';

      const heading = document.createElement('h2');
      heading.textContent = section.title;
      sectionEl.appendChild(heading);

      for (const setting of sectionSettings) {
        sectionEl.appendChild(this.buildField(setting));
      }
      container.appendChild(sectionEl);
    }
    this.refreshVisibility();
  }

  private buildField(setting: SettingDefinition): HTMLElement {
    const wrapper = document.createElement('label');
    wrapper.className = setting.kind === 'checkbox' ? 'control-field inline-field' : 'control-field';
    this.fieldWrappers.set(setting.id, wrapper);

    const span = document.createElement('span');
    span.textContent = setting.label;
    wrapper.appendChild(span);

    if (setting.kind === 'slider') {
      const row = document.createElement('div');
      row.className = 'value-row';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = String(setting.min);
      range.max = String(setting.max);
      range.step = String(setting.step);
      range.value = String(setting.default);

      const number = document.createElement('input');
      number.type = 'number';
      number.className = 'value-input';
      number.min = String(setting.min);
      number.max = String(setting.max);
      number.step = String(setting.step);
      number.value = String(setting.default);

      const commit = (raw: string) => {
        const clamped = Math.min(setting.max, Math.max(setting.min, Number(raw)));
        this.commitChange(setting, clamped);
      };

      range.addEventListener('input', () => commit(range.value));
      number.addEventListener('change', () => commit(number.value));

      row.appendChild(range);
      row.appendChild(number);
      wrapper.appendChild(row);
      this.controlRefs.set(setting.id, { kind: 'slider', range, number });
    } else if (setting.kind === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      if (setting.min !== undefined) input.min = String(setting.min);
      if (setting.max !== undefined) input.max = String(setting.max);
      if (setting.step !== undefined) input.step = String(setting.step);
      input.value = String(setting.default);
      input.addEventListener('change', () => this.commitChange(setting, Number(input.value)));
      wrapper.appendChild(input);
      this.controlRefs.set(setting.id, { kind: 'number', input });
    } else if (setting.kind === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = setting.default;
      input.addEventListener('change', () => this.commitChange(setting, input.checked));
      wrapper.appendChild(input);
      this.controlRefs.set(setting.id, { kind: 'checkbox', input });
    } else {
      const select = document.createElement('select');
      for (const option of setting.options) {
        const optionEl = document.createElement('option');
        optionEl.value = option.value;
        optionEl.textContent = option.label;
        select.appendChild(optionEl);
      }
      select.value = setting.default;
      select.addEventListener('change', () => this.commitChange(setting, select.value));
      wrapper.appendChild(select);
      this.controlRefs.set(setting.id, { kind: 'select', select });
    }

    return wrapper;
  }

  private commitChange(setting: SettingDefinition, value: SettingValue): void {
    this.state[setting.id] = value;
    this.syncControlDisplay(setting.id);

    let shouldRerender = setting.rerender;

    if (setting.rangeLink) {
      const correction = enforceRangeLink(value as number, setting.rangeLink, this.state);
      if (correction) {
        const pairedSetting = this.registry.find((s) => s.id === correction.id);
        this.state[correction.id] = correction.value;
        this.syncControlDisplay(correction.id);
        if (pairedSetting?.rerender) shouldRerender = true;
      }
    }

    // Settings with onChange own their own side effects (including calling
    // requestRender/syncCanvasSize themselves) — they opt OUT of the
    // automatic `rerender` flag by design, see note below.
    if (setting.onChange) {
      setting.onChange(value as never, this.api);
    } 
    if (shouldRerender) {
      this.host.requestRender();
    }

    this.refreshVisibility();
  }

  private syncControlDisplay(id: string): void {
    const refs = this.controlRefs.get(id);
    if (!refs) return;
    const value = this.state[id];

    if (refs.kind === 'slider') {
      refs.range.value = String(value);
      refs.number.value = String(value);
    } else if (refs.kind === 'number') {
      refs.input.value = String(value);
    } else if (refs.kind === 'checkbox') {
      refs.input.checked = value as boolean;
    } else {
      refs.select.value = value as string;
    }
  }

  private refreshVisibility(): void {
    for (const setting of this.registry) {
      if (!setting.visibleWhen) continue;
      const wrapper = this.fieldWrappers.get(setting.id);
      if (!wrapper) continue;
      wrapper.style.display = setting.visibleWhen(this.state) ? '' : 'none';
    }
  }

  private readonly api: SettingChangeApi = {
    requestRender: () => this.host.requestRender(),
    syncCanvasSize: () => this.host.syncCanvasSize(),
    getValue: this.getValue,
    setValue: this.setValue,
  };
}