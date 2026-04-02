import { describe, expect, it } from 'vitest';
import {
  F1AIRE_STATUS_FRAMES,
  getEngineerStatusFlashOpacity,
  getEngineerStatusGlimmerIndex,
  getEngineerStatusGlyph,
  interpolateEngineerStatusColor,
  splitEngineerStatusMessage,
} from './engineer-status-animation.js';

describe('engineer status animation', () => {
  it('uses an f1aire-owned spinner cycle instead of the borrowed symbol set', () => {
    expect(F1AIRE_STATUS_FRAMES).toEqual(['▁', '▃', '▅', '▇', '▅', '▃']);
    expect(getEngineerStatusGlyph(0)).toBe('▁');
    expect(getEngineerStatusGlyph(120)).toBe('▃');
    expect(getEngineerStatusGlyph(360)).toBe('▇');
  });

  it('matches the reference shimmer travel direction and padding for thinking/responding modes', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 0,
      }),
    ).toBe(18);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'thinking',
        message: 'Thinking',
        time: 200,
      }),
    ).toBe(17);
  });

  it('matches the reference shimmer travel direction and padding for requesting mode', () => {
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'requesting',
        message: 'Loading',
        time: 0,
      }),
    ).toBe(-10);
    expect(
      getEngineerStatusGlimmerIndex({
        mode: 'requesting',
        message: 'Loading',
        time: 100,
      }),
    ).toBe(-8);
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

  it('uses continuous flash opacity for tool-use status text', () => {
    expect(getEngineerStatusFlashOpacity({ mode: 'tool-use', time: 0 })).toBe(
      0.5,
    );
    expect(
      getEngineerStatusFlashOpacity({ mode: 'tool-use', time: 500 }),
    ).toBe(1);
    expect(
      getEngineerStatusFlashOpacity({ mode: 'thinking', time: 500 }),
    ).toBe(0);
  });

  it('interpolates tool-use shimmer colors as truecolor RGB values', () => {
    expect(
      interpolateEngineerStatusColor({
        baseColor: 'rgb(122,180,232)',
        shimmerColor: 'rgb(183,224,255)',
        flashOpacity: 0.5,
      }),
    ).toBe('rgb(153,202,244)');
  });

  it('falls back to hard switching only when a color cannot be parsed as RGB', () => {
    expect(
      interpolateEngineerStatusColor({
        baseColor: 'ansi:blueBright',
        shimmerColor: 'ansi:whiteBright',
        flashOpacity: 0.4,
      }),
    ).toBe('ansi:blueBright');
    expect(
      interpolateEngineerStatusColor({
        baseColor: 'ansi:blueBright',
        shimmerColor: 'ansi:whiteBright',
        flashOpacity: 0.8,
      }),
    ).toBe('ansi:whiteBright');
  });
});
