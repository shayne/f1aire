import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { ensurePyodideAssets } from './assets.js';

const tmpRoot = path.join(process.cwd(), '.tmp-pyodide-test');

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<any>('node:fs/promises');
  return {
    ...actual,
    access: vi.fn().mockRejectedValue(new Error('missing')),
    mkdir: vi.fn(),
  };
});

describe('ensurePyodideAssets', () => {
  it('downloads and extracts when assets are missing', async () => {
    const download = vi.fn().mockResolvedValue(path.join(tmpRoot, 'pyodide.tar.bz2'));
    const extract = vi.fn().mockResolvedValue(undefined);

    await ensurePyodideAssets({
      version: '0.29.3',
      baseDir: tmpRoot,
      download,
      extract,
    });

    expect(download).toHaveBeenCalled();
    expect(extract).toHaveBeenCalled();
  });
});
