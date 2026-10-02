import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { SkxvWatermarkElement, WatermarkAttributes } from './skxv-watermark';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'skxv-watermark': DetailedHTMLProps<HTMLAttributes<SkxvWatermarkElement>, SkxvWatermarkElement> & WatermarkAttributes;
    }
  }
}
