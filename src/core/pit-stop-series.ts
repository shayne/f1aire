import { parseDurationMs } from './pit-lane-time-collection.js';
import { isPlainObject, mergeDeep } from './processors/merge.js';

export type PitStopSeriesPitStop = Record<string, unknown> & {
  RacingNumber?: string | number | null;
  PitStopTime?: string | number | null;
  PitLaneTime?: string | number | null;
  Lap?: string | number | null;
  Timestamp?: string | null;
  Utc?: string | null;
};

export type PitStopSeriesStopEntry = Record<string, unknown> & {
  Timestamp?: string | null;
  Utc?: string | null;
  PitStop?: PitStopSeriesPitStop | null;
  RacingNumber?: string | number | null;
  PitStopTime?: string | number | null;
  PitLaneTime?: string | number | null;
  Lap?: string | number | null;
};

export type PitStopSeriesState = Record<string, unknown> & {
  PitTimes?: Record<string, Record<string, PitStopSeriesStopEntry>>;
};

export type PitStopSeriesOrder = 'asc' | 'desc';

export type PitStopSeriesRecord = {
  driverNumber: string;
  stopNumber: number | null;
  lap: number | null;
  timestamp: string | null;
  dateTime: Date | null;
  pitStopTime: string | null;
  pitStopTimeMs: number | null;
  pitLaneTime: string | null;
  pitLaneTimeMs: number | null;
  raw: PitStopSeriesStopEntry;
};

function cloneState(state: PitStopSeriesState): PitStopSeriesState {
  return structuredClone(state) as PitStopSeriesState;
}

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function arrayToIndexedObject<T>(value: T[]): Record<string, T> {
  const out: Record<string, T> = {};
  value.forEach((entry, index) => {
    out[String(index)] = entry;
  });
  return out;
}

function toOrderedEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((entry, index) => [String(index), entry]);
  }
  if (!isPlainObject(value)) {
    return [];
  }
  return Object.entries(value)
    .filter(([key]) => key !== '_kf')
    .sort(([left], [right]) => compareMaybeNumericStrings(left, right));
}

function toOptionalString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePitStopSeriesDate(value: unknown): Date | null {
  const text = toOptionalString(value);
  if (!text) {
    return null;
  }

  const normalized = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(text)
    ? text
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text}Z`
      : text;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizeDriverStops(
  value: unknown,
): Record<string, PitStopSeriesStopEntry> | null {
  const candidate = Array.isArray(value) ? arrayToIndexedObject(value) : value;
  if (!isPlainObject(candidate)) {
    return null;
  }

  const normalized: Record<string, PitStopSeriesStopEntry> = {};
  for (const [stopKey, rawStop] of Object.entries(candidate)) {
    if (stopKey === '_kf' || !isPlainObject(rawStop)) {
      continue;
    }

    normalized[stopKey] = structuredClone(rawStop) as PitStopSeriesStopEntry;
  }

  return normalized;
}

function normalizePitStopSeriesPatch(
  value: unknown,
): PitStopSeriesState | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const next = structuredClone(value) as PitStopSeriesState;
  if (!isPlainObject(next.PitTimes)) {
    return next;
  }

  const normalizedPitTimes: Record<
    string,
    Record<string, PitStopSeriesStopEntry>
  > = {};
  for (const [driverKey, rawStops] of Object.entries(next.PitTimes)) {
    if (driverKey === '_kf') {
      continue;
    }

    const normalizedStops = normalizeDriverStops(rawStops);
    if (!normalizedStops) {
      continue;
    }

    normalizedPitTimes[driverKey] = normalizedStops;
  }

  next.PitTimes = normalizedPitTimes;
  return next;
}

function comparePitStopSeriesRecords(
  left: PitStopSeriesRecord,
  right: PitStopSeriesRecord,
) {
  if (left.lap !== null || right.lap !== null) {
    if (left.lap === null) {
      return 1;
    }
    if (right.lap === null) {
      return -1;
    }
    if (left.lap !== right.lap) {
      return left.lap - right.lap;
    }
  }

  if (left.dateTime || right.dateTime) {
    if (!left.dateTime) {
      return 1;
    }
    if (!right.dateTime) {
      return -1;
    }
    const diff = left.dateTime.getTime() - right.dateTime.getTime();
    if (diff !== 0) {
      return diff;
    }
  }

  const driverDiff = compareMaybeNumericStrings(
    left.driverNumber,
    right.driverNumber,
  );
  if (driverDiff !== 0) {
    return driverDiff;
  }

  if (left.stopNumber !== null || right.stopNumber !== null) {
    if (left.stopNumber === null) {
      return 1;
    }
    if (right.stopNumber === null) {
      return -1;
    }
    if (left.stopNumber !== right.stopNumber) {
      return left.stopNumber - right.stopNumber;
    }
  }

  return 0;
}

export function mergePitStopSeriesState(
  current: PitStopSeriesState | null,
  patch: unknown,
): PitStopSeriesState | null {
  const normalizedPatch = normalizePitStopSeriesPatch(patch);
  if (!normalizedPatch) {
    return current ? cloneState(current) : null;
  }

  const next = current ? cloneState(current) : {};
  mergeDeep(next as Record<string, unknown>, normalizedPatch);
  return next as PitStopSeriesState;
}

export function buildPitStopSeriesState(opts: {
  baseState?: unknown;
  timeline?: Array<{ json: unknown }>;
}): PitStopSeriesState | null {
  let state = mergePitStopSeriesState(null, opts.baseState ?? null);
  for (const point of opts.timeline ?? []) {
    state = mergePitStopSeriesState(state, point?.json ?? null);
  }
  return state;
}

export function getPitStopSeriesRecords(opts: {
  state: unknown;
  driverNumber?: string | number;
  startLap?: number;
  endLap?: number;
  limit?: number;
  order?: PitStopSeriesOrder;
}): PitStopSeriesRecord[] {
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);
  const startLap = typeof opts.startLap === 'number' ? opts.startLap : null;
  const endLap = typeof opts.endLap === 'number' ? opts.endLap : null;
  const pitTimes = isPlainObject(
    (opts.state as { PitTimes?: unknown } | null)?.PitTimes,
  )
    ? ((opts.state as { PitTimes: Record<string, unknown> }).PitTimes ?? {})
    : {};

  const driverNumbers = requestedDriver
    ? [requestedDriver]
    : Object.keys(pitTimes).sort(compareMaybeNumericStrings);

  const records: PitStopSeriesRecord[] = [];

  for (const driverNumber of driverNumbers) {
    const rawStops = pitTimes[driverNumber];
    for (const [stopKey, rawStop] of toOrderedEntries(rawStops)) {
      if (!isPlainObject(rawStop)) {
        continue;
      }

      const nested = isPlainObject(rawStop.PitStop) ? rawStop.PitStop : rawStop;
      const stopNumber = toOptionalNumber(stopKey);
      const lap = toOptionalNumber(
        (nested as Record<string, unknown>).Lap ?? rawStop.Lap,
      );
      if (startLap !== null && lap !== null && lap < startLap) {
        continue;
      }
      if (endLap !== null && lap !== null && lap > endLap) {
        continue;
      }

      const timestamp =
        toOptionalString(rawStop.Timestamp) ??
        toOptionalString((nested as Record<string, unknown>).Timestamp) ??
        toOptionalString(rawStop.Utc) ??
        toOptionalString((nested as Record<string, unknown>).Utc);
      const pitStopTime =
        toOptionalString((nested as Record<string, unknown>).PitStopTime) ??
        toOptionalString(rawStop.PitStopTime);
      const pitLaneTime =
        toOptionalString((nested as Record<string, unknown>).PitLaneTime) ??
        toOptionalString(rawStop.PitLaneTime);
      const canonicalDriver =
        toOptionalString((nested as Record<string, unknown>).RacingNumber) ??
        toOptionalString(rawStop.RacingNumber) ??
        driverNumber;

      records.push({
        driverNumber: canonicalDriver,
        stopNumber,
        lap,
        timestamp,
        dateTime: parsePitStopSeriesDate(timestamp),
        pitStopTime,
        pitStopTimeMs: parseDurationMs(pitStopTime),
        pitLaneTime,
        pitLaneTimeMs: parseDurationMs(pitLaneTime),
        raw: structuredClone(rawStop) as PitStopSeriesStopEntry,
      });
    }
  }

  records.sort(comparePitStopSeriesRecords);

  if (opts.order === 'desc') {
    records.reverse();
  }

  if (typeof opts.limit === 'number' && Number.isFinite(opts.limit)) {
    return records.slice(0, Math.max(0, opts.limit));
  }

  return records;
}
