import { afterEach, describe, expect, it } from 'vitest';
import { getDataDir } from './xdg.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
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
});
