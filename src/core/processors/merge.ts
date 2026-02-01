export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function mergeDeep(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      target[key] = value;
      continue;
    }
    if (isPlainObject(value)) {
      const existing = target[key];
      if (!isPlainObject(existing)) {
        target[key] = {};
      }
      mergeDeep(target[key] as Record<string, unknown>, value);
      continue;
    }
    target[key] = value;
  }
}
