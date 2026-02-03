import path from 'node:path';
import { getDataDir } from '../../core/xdg.js';

export const PYODIDE_VERSION = '0.29.3';

export function getPyodideBaseDir() {
  return path.join(getDataDir('f1aire'), 'pyodide', PYODIDE_VERSION);
}

export function getPyodideIndexUrl() {
  return path.join(getPyodideBaseDir(), 'full');
}
