import { readFile, writeFile } from 'node:fs/promises';

export function versionFromGitTag(tag: string) {
  const trimmed = tag.trim();
  if (!trimmed.startsWith('v')) {
    throw new Error('Expected a v-prefixed git tag.');
  }
  const version = trimmed.slice(1).trim();
  if (!version) {
    throw new Error('Expected a version after the v prefix.');
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
