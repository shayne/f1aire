import { globSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const files = globSync('src/vendor/**/*.{ts,tsx,js,jsx}');
const marker = 'sourceMappingURL=data:application/json;charset=utf-8;base64,';
const replacements = new Map([
  ['src/bootstrap/state.js', 'src/vendor/bootstrap/state.ts'],
  [
    'src/native-ts/yoga-layout/index.js',
    'src/vendor/native-ts/yoga-layout/index.ts',
  ],
  ['src/utils/debug.js', 'src/vendor/utils/debug.ts'],
  ['src/utils/log.js', 'src/vendor/utils/log.ts'],
]);

function toImportPath(fromFile, targetFile) {
  const relative = path.relative(path.dirname(fromFile), targetFile);
  const normalized = relative.split(path.sep).join('/');
  const withPrefix = normalized.startsWith('.') ? normalized : `./${normalized}`;
  return withPrefix.replace(/\.(ts|tsx|js|jsx)$/, '.js');
}

for (const file of files) {
  const input = readFileSync(file, 'utf8');
  const idx = input.lastIndexOf(marker);
  let restored = input;

  if (idx >= 0) {
    const encoded = input.slice(idx + marker.length).trim();
    const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    const source = map.sourcesContent?.[0];

    if (source) {
      restored = source;
    }
  }

  let normalized = restored;

  for (const [sourceImport, targetFile] of replacements) {
    const replacement = toImportPath(file, targetFile);
    normalized = normalized
      .replaceAll(`from '${sourceImport}'`, `from '${replacement}'`)
      .replaceAll(`from "${sourceImport}"`, `from "${replacement}"`);
  }

  writeFileSync(file, normalized, 'utf8');
}
