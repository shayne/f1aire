import { afterEach, describe, expect, it } from 'vitest';
import {
  getSystemThemeName,
  parseColorfgbgTheme,
  resetCachedSystemThemeForTests,
  resolveAutoThemeName,
  setCachedSystemTheme,
  themeFromOscColor,
} from './system-theme.js';

describe('system-theme', () => {
  const originalColorfgbg = process.env.COLORFGBG;

  afterEach(() => {
    if (originalColorfgbg === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = originalColorfgbg;
    }

    resetCachedSystemThemeForTests();
  });

  it('parses dark and light hints from $COLORFGBG', () => {
    expect(parseColorfgbgTheme('15;0')).toBe('dark');
    expect(parseColorfgbgTheme('0;15')).toBe('light');
    expect(parseColorfgbgTheme('0;2;7')).toBe('light');
    expect(parseColorfgbgTheme('')).toBeUndefined();
    expect(parseColorfgbgTheme('0;not-a-number')).toBeUndefined();
  });

  it('seeds the cached system theme from $COLORFGBG and falls back to dark', () => {
    process.env.COLORFGBG = '0;15';
    expect(getSystemThemeName()).toBe('light');

    resetCachedSystemThemeForTests();
    delete process.env.COLORFGBG;
    expect(getSystemThemeName()).toBe('dark');
  });

  it('classifies OSC 11 color responses by luminance', () => {
    expect(themeFromOscColor('rgb:0000/0000/0000')).toBe('dark');
    expect(themeFromOscColor('rgb:ffff/ffff/ffff')).toBe('light');
    expect(themeFromOscColor('#ffffff')).toBe('light');
    expect(themeFromOscColor('#000000')).toBe('dark');
    expect(themeFromOscColor('not-a-color')).toBeUndefined();
  });

  it('resolves auto theme names from the cached system theme only', () => {
    setCachedSystemTheme('light');

    expect(resolveAutoThemeName()).toBe('light');
  });
});
