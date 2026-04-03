import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { getDataDir } from '../../core/xdg.js';

export const PYODIDE_VERSION = '0.29.3';

const nodeRequire = createRequire(import.meta.url);
export const PYODIDE_RUNTIME_FILES = [
  'pyodide-lock.json',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
];

export function getPyodideBaseDir() {
  return path.join(getDataDir('f1aire'), 'pyodide', PYODIDE_VERSION);
}

function getBundledPyodideBaseDir() {
  try {
    const packageJsonPath = nodeRequire.resolve('pyodide/package.json');
    const packageDir = path.dirname(packageJsonPath);
    if (
      PYODIDE_RUNTIME_FILES.every((fileName) =>
        fs.existsSync(path.join(packageDir, fileName)),
      )
    ) {
      return packageDir;
    }
  } catch {
    // Fall back to the XDG cache directory if the package is missing or incomplete.
  }
  return null;
}

export function getPyodideIndexUrl() {
  return (getBundledPyodideBaseDir() ?? getPyodideBaseDir()) + path.sep;
}
