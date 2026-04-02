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

  it('moves requesting shimmer left to right and response shimmer right to left', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'requesting',
        message: 'Loading',
        time: 0,
      }),
    ).toBe(0);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'requesting',
        message: 'Loading',
        time: 120,
      }),
    ).toBe(1);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 0,
      }),
    ).toBe(7);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 120,
      }),
    ).toBe(6);
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

  it('wraps the shimmer window to the edge of the current sweep direction', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'requesting',
        message: 'Thinking',
        time: 960,
      }),
    ).toBe(0);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 960,
      }),
    ).toBe(7);
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
