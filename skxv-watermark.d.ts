export interface WatermarkOptions {
  width: number;
  openness: number;
  'pupil-size': number;
  speed: number;
  inertia: number;
  tilt: number;
  'blink-interval': number;
  'double-blink-chance': number;
  'entrance-blur': number;
  'auto-blink': boolean;
  'follow-cursor': boolean;
  'pupil-lead': boolean;
  'idle-glances': boolean;
  'resting-expression': boolean;
  intro: boolean;
  emotion: 'neutral' | 'happy' | 'angry' | 'scared' | 'skeptical';
}

export interface SkxvWatermarkElement extends HTMLElement, WatermarkOptions {
  readonly options: WatermarkOptions;
  readonly ready: Promise<boolean>;
  replay(): Promise<void>;
  blink(double?: boolean): Promise<void>;
  preview(): Promise<void>;
  resetOptions(): Promise<void>;
}

export type WatermarkAttributes = {
  [Key in keyof WatermarkOptions]?: WatermarkOptions[Key] extends boolean
    ? boolean | '' | 'true' | 'false' | '0' | 'off'
    : number | string;
} & { color?: string };

declare global {
  interface HTMLElementTagNameMap {
    'skxv-watermark': SkxvWatermarkElement;
  }
}
