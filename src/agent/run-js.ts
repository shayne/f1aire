import { createRequire } from 'node:module';
import vm from 'node:vm';
import { transform } from 'esbuild';

const nodeRequire = createRequire(import.meta.url);

export async function runJs({
  code,
  context,
}: {
  code: string;
  context: Record<string, unknown>;
}) {
  const transformed = await transform(code, {
    loader: 'ts',
    format: 'cjs',
    target: 'es2022',
  });
  const module = { exports: {} as Record<string, unknown> };
  const sandbox = {
    ...context,
    console,
    require: nodeRequire,
    fetch,
    module,
    exports: module.exports,
  } as Record<string, unknown> & { globalThis?: unknown };
  sandbox.globalThis = sandbox;
  const script = new vm.Script(`(async () => { ${transformed.code}\n })()`);
  const ctx = vm.createContext(sandbox);
  return await script.runInContext(ctx);
}
