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

  it.each(activeModes)('moves shimmer left to right for %s status', (mode) => {
    const message = mode === 'requesting' ? 'Loading' : 'Thinking';

    expect(
      getEngineerStatusGlimmerIndex({
        mode,
        message,
        time: 0,
      }),
    ).toBe(0);
    expect(
      getEngineerStatusGlimmerIndex({
        mode,
        message,
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

  it.each(activeModes)(
    'wraps the shimmer window to the left edge for %s status',
    (mode) => {
      expect(
        getEngineerStatusGlimmerIndex({
          mode,
          message: 'Thinking',
          time: 960,
        }),
      ).toBe(0);
    },
  );

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
