import path from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensurePyodideAssets } from './assets.js';

const tmpRoot = path.join(process.cwd(), '.tmp-pyodide-test');

const { accessMock, mkdirMock, unlinkMock, writeFileMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  mkdirMock: vi.fn(),
  unlinkMock: vi.fn(),
  writeFileMock: vi.fn(),
}));

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<any>('node:fs/promises');
  return {
    ...actual,
    access: accessMock,
    mkdir: mkdirMock,
    unlink: unlinkMock,
    writeFile: writeFileMock,
  };
});

describe('ensurePyodideAssets', () => {
  beforeEach(() => {
    accessMock.mockReset();
    mkdirMock.mockReset();
    unlinkMock.mockReset();
    writeFileMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);
  });

  it('downloads and extracts when assets are missing', async () => {
    accessMock.mockRejectedValue(new Error('missing'));
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
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join(tmpRoot, 'pyodide-lock.json'),
      expect.any(String),
      'utf-8',
    );
  });

  it('checks for the pyodide lockfile marker before downloading', async () => {
    accessMock.mockRejectedValue(new Error('missing'));
    const download = vi.fn().mockResolvedValue(path.join(tmpRoot, 'pyodide.tar.bz2'));
    const extract = vi.fn().mockResolvedValue(undefined);
    const baseDir = path.join(tmpRoot, 'marker-check');

    await ensurePyodideAssets({
      version: '0.29.3',
      baseDir,
      download,
      extract,
    });

    expect(accessMock).toHaveBeenCalledWith(path.join(baseDir, 'pyodide-lock.json'));
  });

  it('forwards download progress updates', async () => {
    accessMock.mockRejectedValue(new Error('missing'));
    const download = vi.fn().mockImplementation(async (_url, _destDir, onDownloadProgress) => {
      onDownloadProgress?.({ downloadedBytes: 5, totalBytes: 10 });
      return path.join(tmpRoot, 'pyodide.tar.bz2');
    });
    const extract = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();

    await ensurePyodideAssets({
      version: '0.29.3',
      baseDir: tmpRoot,
      download,
      extract,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'downloading',
        downloadedBytes: 5,
        totalBytes: 10,
      }),
    );
    expect(writeFileMock).toHaveBeenCalled();
  });
});
