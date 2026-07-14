export type SettingValue = number | string | boolean;
export type SettingsState = Record<string, SettingValue>;

export interface SettingChangeApi {
    requestRender: () => void;
    syncCanvasSize: () => void;
    getValue: (id: string) => SettingValue;
    setValue: (id: string, value: SettingValue) => void;
}



export interface RangeLinkConfig {
    /** Which end of the pair this field represents. */
    role: 'min' | 'max';
    /** id of the setting representing the other end of the range. */
    pairedWith: string;
}

interface SettingBase<T extends SettingValue> {
    /** Unique key. Doubles as the settings-state key and the DOM id prefix. */
    id: string;
    label: string;
    /** Which control-panel section this renders into (see SECTIONS below). */
    section: string;
    default: T;
    /** Trigger requestRender() automatically when this changes. */
    rerender: boolean;
    /** Hide the control when this returns false. Re-checked after every settings change. */
    visibleWhen?: (settings: SettingsState) => boolean;
    /** Escape hatch for anything beyond "set value, maybe rerender" — cross-field constraints, canvas resize, etc. */
    onChange?: (value: T, api: SettingChangeApi) => void;
    /** Declares this field as one end of a min/max pair that should never cross its partner. */
  rangeLink?: RangeLinkConfig;
}

export interface SliderSetting extends SettingBase<number> {
    kind: 'slider';
    min: number;
    max: number;
    step: number;
    /** How to render the paired numeric readout. Defaults to String(value). */
    format?: (value: number) => string;
}

export interface NumberSetting extends SettingBase<number> {
    kind: 'number';
    min?: number;
    max?: number;
    step?: number;
}

export interface CheckboxSetting extends SettingBase<boolean> {
    kind: 'checkbox';
}

export interface SelectSetting extends SettingBase<string> {
    kind: 'select';
    options: Array<{ value: string; label: string }>;
}

export type SettingDefinition = SliderSetting | NumberSetting | CheckboxSetting | SelectSetting;

export interface SettingSectionDefinition {
    id: string;
    title: string;
}