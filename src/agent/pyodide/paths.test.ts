import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { getPyodideBaseDir, getPyodideIndexUrl } from './paths.js';

describe('getPyodideIndexUrl', () => {
  it('points to the pyodide base directory', () => {
    const baseDir = getPyodideBaseDir();
    const expected = baseDir + path.sep;
    expect(getPyodideIndexUrl()).toBe(expected);
  });
});
