import { createPythonClient } from './pyodide/client.js';

export async function runPy({
  code,
  context,
  runtime = createPythonClient(),
}: {
  code: string;
  context: Record<string, unknown>;
  runtime?: { run: (opts: { code: string; context?: unknown }) => Promise<{ ok: boolean; value?: unknown; error?: string }> };
}) {
  const result = await runtime.run({ code, context });
  if (!result.ok) throw new Error(result.error ?? 'Python execution failed');
  return result.value ?? null;
}
