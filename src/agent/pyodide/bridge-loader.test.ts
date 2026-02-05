import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { resolveBridgeModuleUrl } from './bridge-loader.js';

describe('resolveBridgeModuleUrl', () => {
  it('prefers python-bridge.js when present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1aire-bridge-'));
    const bridgeJsPath = path.join(tmpDir, 'python-bridge.js');
    const baseUrl = pathToFileURL(path.join(tmpDir, 'worker.ts')).href;
    fs.writeFileSync(bridgeJsPath, '// bridge js');

    const resolved = resolveBridgeModuleUrl({ baseUrl });

    expect(fileURLToPath(resolved)).toBe(bridgeJsPath);
  });

  it('falls back to python-bridge.ts when js is missing', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f1aire-bridge-'));
    const bridgeTsPath = path.join(tmpDir, 'python-bridge.ts');
    const baseUrl = pathToFileURL(path.join(tmpDir, 'worker.ts')).href;
    fs.writeFileSync(bridgeTsPath, '// bridge ts');

    const resolved = resolveBridgeModuleUrl({ baseUrl });

    expect(fileURLToPath(resolved)).toBe(bridgeTsPath);
  });
});
