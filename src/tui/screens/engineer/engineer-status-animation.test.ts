import { describe, expect, it } from 'vitest';
import {
  F1AIRE_STATUS_FRAMES,
  getEngineerStatusGlimmerIndex,
  getEngineerStatusGlyph,
  splitEngineerStatusMessage,
} from './engineer-status-animation.js';

const activeModes = [
  'thinking',
  'responding',
  'requesting',
  'tool-use',
] as const;

describe('engineer status animation', () => {
  it('uses a Braille dots spinner cycle', () => {
    expect(F1AIRE_STATUS_FRAMES).toEqual([
      '⠋',
      '⠙',
      '⠹',
      '⠸',
      '⠼',
      '⠴',
      '⠦',
      '⠧',
      '⠇',
      '⠏',
    ]);
    expect(getEngineerStatusGlyph(0)).toBe('⠋');
    expect(getEngineerStatusGlyph(80)).toBe('⠙');
    expect(getEngineerStatusGlyph(720)).toBe('⠏');
  });

  it('moves the shimmer window left to right across the status text', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 0,
      }),
    ).toBe(0);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 120,
      }),
    ).toBe(1);
  });

  it.each(activeModes)(
    'keeps the shimmer band visible on every frame for %s status',
    (mode) => {
      for (let time = 0; time <= 2000; time += 120) {
        const message = mode === 'requesting' ? 'Loading telemetry' : 'Thinking...';
        const segments = splitEngineerStatusMessage({
          message,
          glimmerIndex: getEngineerStatusGlimmerIndex({
            mode,
            message,
            time,
          }),
        });

        expect(segments.shimmer).not.toBe('');
      }
    },
  );

  it('wraps the shimmer window to the first character instead of going offscreen', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 960,
      }),
    ).toBe(0);
  });

  it('keeps grapheme clusters intact when slicing shimmer segments', () => {
    expect(
      splitEngineerStatusMessage({
        message: '👩‍🚀 pace',
        glimmerIndex: 1,
      }),
    ).toEqual({
      before: '',
      shimmer: '👩‍🚀 ',
      after: 'pace',
    });
  });
});
