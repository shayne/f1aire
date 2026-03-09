import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import {
  stampPackageVersion,
  versionFromGitTag,
} from './build-npm-package.ts';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await import('node:fs/promises').then(({ rm }) =>
        rm(dir, { recursive: true, force: true }),
      );
    }),
  );
  tempDirs.length = 0;
});

describe('versionFromGitTag', () => {
  test('derives a package version from a v-prefixed git tag', () => {
    expect(versionFromGitTag('v0.1.6')).toBe('0.1.6');
  });

  test('rejects invalid git tags', () => {
    expect(() => versionFromGitTag('0.1.6')).toThrow(/v-prefixed/i);
    expect(() => versionFromGitTag('v')).toThrow(/version/i);
  });
});

describe('stampPackageVersion', () => {
  test('stamps the staged package without changing the repo template version', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-npm-stage-'));
    tempDirs.push(dir);

    const repoPackagePath = path.join(dir, 'package.json');
    const stageDir = path.join(dir, 'dist', 'npm');
    const stagePackagePath = path.join(stageDir, 'package.json');

    await writeFile(
      repoPackagePath,
      JSON.stringify({ name: 'f1aire', version: '0.0.0' }, null, 2) + '\n',
    );
    await mkdir(stageDir, { recursive: true });
    await writeFile(
      stagePackagePath,
      JSON.stringify({ name: 'f1aire', version: '0.0.0' }, null, 2) + '\n',
    );

    await stampPackageVersion({
      packageJsonPath: stagePackagePath,
      version: '0.1.6',
    });

    const staged = JSON.parse(await readFile(stagePackagePath, 'utf8'));
    const repo = JSON.parse(await readFile(repoPackagePath, 'utf8'));

    expect(staged.version).toBe('0.1.6');
    expect(repo.version).toBe('0.0.0');
  });
});
