import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getConfigDir, getDataDir } from './xdg.js';

const originalEnv = { ...process.env };
const isWin = process.platform === 'win32';
const itIf = (condition: boolean) => (condition ? it : it.skip);

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('getDataDir', () => {
  itIf(!isWin)('uses XDG_DATA_HOME when set', () => {
    process.env.XDG_DATA_HOME = '/tmp/xdg-data';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/tmp/xdg-data/f1aire/data');
  });

  itIf(!isWin)('falls back to ~/.local/share on unix', () => {
    delete process.env.XDG_DATA_HOME;
    process.env.HOME = '/home/tester';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/home/tester/.local/share/f1aire/data');
  });

  itIf(!isWin)('falls back to os.homedir() when HOME is missing', () => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('/home/fallback');
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/home/fallback/.local/share/f1aire/data');
  });

  itIf(!isWin)('throws when os.homedir() is empty', () => {
    delete process.env.XDG_DATA_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('');
    expect(() => getDataDir('f1aire')).toThrow(
      /Unable to determine a home directory/,
    );
  });

  itIf(isWin)('falls back to homedir AppData Local when appdata missing', () => {
    delete process.env.LOCALAPPDATA;
    delete process.env.APPDATA;
    const home = 'C:\\Users\\Tester';
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const dir = getDataDir('f1aire');
    expect(dir).toBe(path.join(home, 'AppData', 'Local', 'f1aire', 'data'));
  });
});

describe('getConfigDir', () => {
  itIf(!isWin)('uses XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = '/tmp/xdg-config';
    const dir = getConfigDir('f1aire');
    expect(dir).toBe('/tmp/xdg-config/f1aire');
  });

  itIf(!isWin)('falls back to ~/.config on unix', () => {
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = '/home/tester';
    const dir = getConfigDir('f1aire');
    expect(dir).toBe('/home/tester/.config/f1aire');
  });

  itIf(!isWin)('falls back to os.homedir() when HOME is missing', () => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('/home/fallback');
    const dir = getConfigDir('f1aire');
    expect(dir).toBe('/home/fallback/.config/f1aire');
  });

  itIf(!isWin)('throws when os.homedir() is empty', () => {
    delete process.env.XDG_CONFIG_HOME;
    delete process.env.HOME;
    vi.spyOn(os, 'homedir').mockReturnValue('');
    expect(() => getConfigDir('f1aire')).toThrow(
      /Unable to determine a home directory/,
    );
  });

  itIf(isWin)('uses APPDATA when set', () => {
    process.env.APPDATA = 'C:\\\\Users\\\\Tester\\\\AppData\\\\Roaming';
    const dir = getConfigDir('f1aire');
    expect(dir).toBe(path.join(process.env.APPDATA, 'f1aire'));
  });

  itIf(isWin)('falls back to homedir AppData Roaming when appdata missing', () => {
    delete process.env.APPDATA;
    const home = 'C:\\\\Users\\\\Tester';
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    const dir = getConfigDir('f1aire');
    expect(dir).toBe(path.join(home, 'AppData', 'Roaming', 'f1aire'));
  });
});
