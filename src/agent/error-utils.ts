import { inspect } from 'node:util';

export function formatUnknownError(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const parts = [error.message || 'Error'];
    const anyErr = error as { status?: number; code?: string };
    if (typeof anyErr.status === 'number') parts.push(`status ${anyErr.status}`);
    if (typeof anyErr.code === 'string') parts.push(`code ${anyErr.code}`);
    return parts.join(' • ');
  }
  if (typeof error === 'object') {
    const anyErr = error as { message?: unknown; status?: unknown; code?: unknown };
    if (typeof anyErr.message === 'string' && anyErr.message.trim().length > 0) {
      const parts = [anyErr.message];
      if (typeof anyErr.status === 'number') parts.push(`status ${anyErr.status}`);
      if (typeof anyErr.code === 'string') parts.push(`code ${anyErr.code}`);
      return parts.join(' • ');
    }
  }
  try {
    const json = JSON.stringify(error);
    if (json && json !== '{}') return json;
  } catch {
    // ignore stringify failures
  }
  if (typeof error === 'object') {
    return inspect(error, { depth: 3, breakLength: 120, maxArrayLength: 20 });
  }
  return String(error);
}
