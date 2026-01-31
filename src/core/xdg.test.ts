import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataDir } from './xdg.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('getDataDir', () => {
  it('uses XDG_DATA_HOME when set', () => {
    process.env.XDG_DATA_HOME = '/tmp/xdg-data';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/tmp/xdg-data/f1aire/data');
  });

  it('falls back to ~/.local/share on unix', () => {
    delete process.env.XDG_DATA_HOME;
    process.env.HOME = '/home/tester';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/home/tester/.local/share/f1aire/data');
  });

  it('falls back to os.homedir() when HOME is missing', () => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('/home/fallback');
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/home/fallback/.local/share/f1aire/data');
  });

  it('throws when os.homedir() is empty', () => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('');
    expect(() => getDataDir('f1aire')).toThrow(
      /Unable to determine a home directory/,
    );
  });
});
