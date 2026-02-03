import path from 'node:path';
import * as fs from 'node:fs/promises';
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
  download?: (url: string, destDir: string) => Promise<string>;
  extract?: (tarPath: string, destDir: string) => Promise<void>;
  onProgress?: (msg: string) => void;
}) {
  const marker = path.join(baseDir, 'full', 'index.html');
  try {
    await fs.access(marker);
    onProgress?.('Python runtime ready.');
    return { ready: true };
  } catch {
    await fs.mkdir(baseDir, { recursive: true });
    onProgress?.('Downloading Python runtime...');
    const tarPath = await download(getTarballUrl(version), baseDir);
    onProgress?.('Extracting Python runtime...');
    await extract(tarPath, baseDir);
    await fs.unlink(tarPath).catch(() => {});
    onProgress?.('Python runtime ready.');
    return { ready: true };
  }
}

async function defaultDownload(url: string, destDir: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const filePath = path.join(destDir, 'pyodide.tar.bz2');
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);
  return filePath;
}

async function defaultExtract(tarPath: string, destDir: string) {
  const { extract } = await import('tar');
  await extract({ file: tarPath, cwd: destDir, strip: 1 });
}
