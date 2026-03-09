import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function versionFromGitTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed.startsWith('v')) {
    throw new Error('Expected a v-prefixed git tag.');
  }
  const version = trimmed.slice(1).trim();
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('Expected a valid semver-style version after the v prefix.');
  }
  return version;
}

export async function stampPackageVersion(options: {
  packageJsonPath: string;
  version: string;
}) {
  const raw = await readFile(options.packageJsonPath, 'utf8');
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg.version = options.version;
  await writeFile(
    options.packageJsonPath,
    JSON.stringify(pkg, null, 2) + '\n',
  );
}

export async function stageNpmPackage(options: {
  repoRoot: string;
  gitTag: string;
}) {
  const version = versionFromGitTag(options.gitTag);
  const distDir = path.join(options.repoRoot, 'dist');
  const stageDir = path.join(distDir, 'npm');
  const stageDistDir = path.join(stageDir, 'dist');

  const builtEntrypoint = path.join(distDir, 'index.js');
  await stat(builtEntrypoint).catch(() => {
    throw new Error(`Missing build output: ${builtEntrypoint}. Run npm run build first.`);
  });

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDistDir, { recursive: true });

  for (const fileName of ['package.json', 'README.md', 'LICENSE']) {
    await cp(
      path.join(options.repoRoot, fileName),
      path.join(stageDir, fileName),
      { recursive: false },
    );
  }

  for (const entry of await readdir(distDir)) {
    if (entry === 'npm') continue;
    await cp(path.join(distDir, entry), path.join(stageDistDir, entry), {
      recursive: true,
    });
  }

  const stagedPackageJsonPath = path.join(stageDir, 'package.json');
  await stampPackageVersion({
    packageJsonPath: stagedPackageJsonPath,
    version,
  });

  return {
    version,
    stageDir,
    stagedPackageJsonPath,
  };
}

async function main() {
  const gitTag = process.env.VERSION;
  if (!gitTag) {
    throw new Error('VERSION is required.');
  }
  const repoRoot = process.cwd();
  const result = await stageNpmPackage({ repoRoot, gitTag });
  process.stdout.write(`${result.stageDir}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
