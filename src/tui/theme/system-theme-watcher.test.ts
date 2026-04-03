import { describe, expect, it, vi } from 'vitest';
import { oscColor } from '../../vendor/ink/terminal-querier.js';
import { watchSystemTheme } from './system-theme-watcher.js';
import {
  getSystemThemeName,
  resetCachedSystemThemeForTests,
  setCachedSystemTheme,
} from './system-theme.js';

describe('watchSystemTheme', () => {
  it('queries OSC 11, updates provider state, and refreshes the cached system theme', async () => {
    resetCachedSystemThemeForTests();
    setCachedSystemTheme('dark');

    const setSystemTheme = vi.fn();
    const querier = {
      send: vi
        .fn()
        .mockResolvedValue({ type: 'osc', code: 11, data: 'rgb:ffff/ffff/ffff' }),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = watchSystemTheme(querier, setSystemTheme);
    await Promise.resolve();
    await Promise.resolve();

    expect(querier.send).toHaveBeenCalledWith(
      expect.objectContaining({ request: oscColor(11).request }),
    );
    expect(querier.flush).toHaveBeenCalled();
    expect(setSystemTheme).toHaveBeenCalledWith('light');
    expect(getSystemThemeName()).toBe('light');

    cleanup();
  });

  it('keeps the current cached theme when OSC 11 is unsupported', async () => {
    resetCachedSystemThemeForTests();
    setCachedSystemTheme('dark');

    const setSystemTheme = vi.fn();
    const querier = {
      send: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = watchSystemTheme(querier, setSystemTheme);
    await Promise.resolve();
    await Promise.resolve();

    expect(setSystemTheme).not.toHaveBeenCalled();
    expect(getSystemThemeName()).toBe('dark');

    cleanup();
  });

  it('flushes the OSC query batch before waiting on the OSC 11 response', async () => {
    const setSystemTheme = vi.fn();
    const querier = {
      send: vi.fn().mockReturnValue(new Promise(() => {})),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = watchSystemTheme(querier, setSystemTheme);
    await Promise.resolve();

    expect(querier.send).toHaveBeenCalledWith(
      expect.objectContaining({ request: oscColor(11).request }),
    );
    expect(querier.flush).toHaveBeenCalled();

    cleanup();
  });
});
