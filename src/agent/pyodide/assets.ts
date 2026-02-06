import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import unbzip2Stream from 'unbzip2-stream';
import { getPyodideBaseDir } from './paths.js';

function getTarballName(version: string) {
  return `pyodide-${version}.tar.bz2`;
}

function getTarballUrl(version: string) {
  const tarball = getTarballName(version);
  return `https://github.com/pyodide/pyodide/releases/download/${version}/${tarball}`;
}

export async function ensurePyodideAssets({
  version,
  baseDir = getPyodideBaseDir(),
  download = defaultDownload,
  extract = defaultExtract,
  onProgress,
}: {
  version: string;
  baseDir?: string;
  download?: (
    url: string,
    destDir: string,
    onProgress?: (progress: DownloadProgress) => void,
  ) => Promise<string>;
  extract?: (tarPath: string, destDir: string) => Promise<void>;
  onProgress?: (update: PyodideProgress) => void;
}) {
  const marker = path.join(baseDir, 'pyodide-lock.json');
  try {
    await fs.access(marker);
    onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
    return { ready: true };
  } catch {
    // Backwards-compat: older versions downloaded/extracted without writing the marker.
    // If we detect the extracted runtime already present, just create the marker and continue.
    const sentinel = path.join(baseDir, 'pyodide.asm.js');
    try {
      await fs.access(sentinel);
      await fs.writeFile(
        marker,
        JSON.stringify({ version, extractedAt: new Date().toISOString(), migrated: true }, null, 2),
        'utf-8',
      );
      onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
      return { ready: true };
    } catch {
      // fall through to download/extract
    }

    await fs.mkdir(baseDir, { recursive: true });
    onProgress?.({ phase: 'downloading', message: 'Downloading Python runtime...' });
    const tarPath = await download(getTarballUrl(version), baseDir, (progress) => {
      onProgress?.({
        phase: 'downloading',
        message: 'Downloading Python runtime...',
        downloadedBytes: progress.downloadedBytes,
        totalBytes: progress.totalBytes,
      });
    });
    onProgress?.({ phase: 'extracting', message: 'Extracting Python runtime...' });
    await extract(tarPath, baseDir);
    await fs.writeFile(
      marker,
      JSON.stringify({ version, extractedAt: new Date().toISOString() }, null, 2),
      'utf-8',
    );
    await fs.unlink(tarPath).catch(() => {});
    onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
    return { ready: true };
  }
}

type DownloadProgress = {
  downloadedBytes: number;
  totalBytes?: number;
};

type PyodideProgress = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
};

async function defaultDownload(
  url: string,
  destDir: string,
  onProgress?: (progress: DownloadProgress) => void,
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const filePath = path.join(destDir, 'pyodide.tar.bz2');
  const totalBytesHeader = res.headers.get('content-length');
  const totalBytes =
    totalBytesHeader && Number.isFinite(Number(totalBytesHeader))
      ? Number(totalBytesHeader)
      : undefined;
  onProgress?.({ downloadedBytes: 0, totalBytes });
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buf);
    onProgress?.({ downloadedBytes: buf.length, totalBytes });
    return filePath;
  }
  const fileStream = createWriteStream(filePath);
  const stream = Readable.fromWeb(res.body as unknown as ReadableStream);
  let downloadedBytes = 0;
  let lastUpdate = 0;
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      const now = Date.now();
      if (now - lastUpdate > 120) {
        lastUpdate = now;
        onProgress?.({ downloadedBytes, totalBytes });
      }
    });
    stream.on('error', reject);
    fileStream.on('error', reject);
    fileStream.on('finish', resolve);
    stream.pipe(fileStream);
  });
  onProgress?.({ downloadedBytes, totalBytes });
  return filePath;
}

async function defaultExtract(tarPath: string, destDir: string) {
  async function readHeaderBytes(filePath: string, length: number) {
    const handle = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  const { extract } = await import('tar');
  if (tarPath.endsWith('.bz2')) {
    const header = await readHeaderBytes(tarPath, 3);
    const looksLikeBzip = header.length === 3 && header.toString('utf-8') === 'BZh';
    if (!looksLikeBzip) {
      const preview =
        header.length > 0 ? JSON.stringify(header.toString('utf-8')) : '"<empty>"';
      throw new Error(
        `Downloaded runtime archive does not look like a .bz2 file (expected \\"BZh\\" header, got ${preview}).`,
      );
    }
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(tarPath)
        .pipe(unbzip2Stream())
        .pipe(extract({ cwd: destDir, strip: 1 }));
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.on('finish', resolve);
    });
    return;
  }
  await extract({ file: tarPath, cwd: destDir, strip: 1 });
}
