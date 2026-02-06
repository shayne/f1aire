import { createPythonClient } from './pyodide/client.js';

export type RunPyResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export async function runPy({
  code,
  context,
  runtime = createPythonClient(),
}: {
  code: string;
  context: Record<string, unknown>;
  runtime?: { run: (opts: { code: string; context?: unknown }) => Promise<{ ok: boolean; value?: unknown; error?: string }> };
}): Promise<RunPyResult> {
  const result = await runtime.run({ code, context });
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Python execution failed' };
  }
  return { ok: true, value: result.value ?? null };
}
