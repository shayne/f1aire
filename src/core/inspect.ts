export type InspectOptions = {
  maxDepth?: number;
  maxKeys?: number;
  maxArray?: number;
};

type Shape = string | { _type: 'array'; items: Shape } | Record<string, Shape>;

type ShapeKind = 'primitive' | 'array' | 'object';

const DEFAULTS = {
  maxDepth: 4,
  maxKeys: 20,
  maxArray: 5,
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const getKind = (shape: Shape): ShapeKind => {
  if (typeof shape === 'string') return 'primitive';
  if ('_type' in shape) return 'array';
  return 'object';
};

const typeLabel = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  return typeof value;
};

const unionTypes = (a: string, b: string) => {
  const set = new Set<string>();
  for (const entry of a.split('|')) set.add(entry);
  for (const entry of b.split('|')) set.add(entry);
  return Array.from(set).sort().join('|');
};

const mergeShapes = (a: Shape, b: Shape): Shape => {
  if (typeof a === 'string' && typeof b === 'string') {
    return a === b ? a : unionTypes(a, b);
  }
  const aKind = getKind(a);
  const bKind = getKind(b);
  if (aKind !== bKind) {
    return unionTypes(
      aKind === 'primitive' ? (a as string) : aKind,
      bKind === 'primitive' ? (b as string) : bKind,
    );
  }
  if (aKind === 'array' && bKind === 'array') {
    const aItems = (a as { _type: 'array'; items: Shape }).items;
    const bItems = (b as { _type: 'array'; items: Shape }).items;
    return { _type: 'array', items: mergeShapes(aItems, bItems) };
  }
  const merged: Record<string, Shape> = { ...(a as Record<string, Shape>) };
  for (const [key, value] of Object.entries(b as Record<string, Shape>)) {
    merged[key] = merged[key] ? mergeShapes(merged[key], value) : value;
  }
  return merged;
};

const toShape = (
  value: unknown,
  options: Required<InspectOptions>,
  depth: number,
  seen: WeakSet<object>,
): Shape => {
  if (value === null || typeof value !== 'object') return typeLabel(value);
  if (value instanceof Date) return 'date';
  if (seen.has(value)) return 'circular';
  if (depth >= options.maxDepth) return 'max-depth';

  seen.add(value);

  if (Array.isArray(value)) {
    const sample = value.slice(0, options.maxArray);
    const itemShape = shapeOfMany(sample, options, depth + 1, seen);
    return { _type: 'array', items: itemShape ?? 'unknown' };
  }

  if (!isPlainObject(value)) return typeLabel(value);

  const keys = Object.keys(value).slice(0, options.maxKeys);
  const result: Record<string, Shape> = {};
  for (const key of keys) {
    result[key] = toShape(
      (value as Record<string, unknown>)[key],
      options,
      depth + 1,
      seen,
    );
  }
  return result;
};

export function shapeOf(value: unknown, options: InspectOptions = {}): Shape {
  const resolved: Required<InspectOptions> = { ...DEFAULTS, ...options };
  return toShape(value, resolved, 0, new WeakSet());
}

export function shapeOfMany(
  values: unknown[],
  options: InspectOptions = {},
  depth = 0,
  seen = new WeakSet<object>(),
): Shape | null {
  if (!values.length) return null;
  const resolved: Required<InspectOptions> = { ...DEFAULTS, ...options };
  let merged: Shape | null = null;
  for (const value of values) {
    const shape = toShape(value, resolved, depth, seen);
    merged = merged ? mergeShapes(merged, shape) : shape;
  }
  return merged;
}
