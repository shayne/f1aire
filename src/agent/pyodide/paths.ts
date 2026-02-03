import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDataDir } from '../../core/xdg.js';

export const PYODIDE_VERSION = '0.29.3';

export function getPyodideBaseDir() {
  return path.join(getDataDir('f1aire'), 'pyodide', PYODIDE_VERSION);
}

export function getPyodideIndexUrl() {
  const fullDir = path.join(getPyodideBaseDir(), 'full') + path.sep;
  return pathToFileURL(fullDir).href;
}
