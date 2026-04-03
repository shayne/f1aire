import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const nodeRequire = createRequire(import.meta.url);

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('getPyodideIndexUrl', () => {
  it('prefers the installed pyodide package runtime when those files are present', async () => {
    const { getPyodideIndexUrl } = await import('./paths.js');
    const expected =
      path.dirname(nodeRequire.resolve('pyodide/package.json')) + path.sep;

    expect(getPyodideIndexUrl()).toBe(expected);
  });

  it('falls back to the pyodide cache directory when bundled package files are missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const { getPyodideBaseDir, getPyodideIndexUrl } = await import('./paths.js');
    const baseDir = getPyodideBaseDir();
    const expected = baseDir + path.sep;

    expect(getPyodideIndexUrl()).toBe(expected);
  });
});
