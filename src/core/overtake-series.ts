import { isPlainObject } from './processors/merge.js';

export type OvertakeSeriesSource = 'OvertakeSeries';

export type OvertakeSeriesRecord = {
  driverNumber: string;
  sequence: number | null;
  timestamp: string | null;
  dateTime: Date | null;
  count: number | null;
  source: OvertakeSeriesSource;
};

export type OvertakeSeriesSummary = {
  driverNumber: string;
  totalEntries: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  latestCount: number | null;
  minCount: number | null;
  maxCount: number | null;
  changes: number;
};

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
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
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function parseOvertakeTimestamp(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const normalized =
    /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(value)
      ? value
      : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
        ? `${value}Z`
        : value;

  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getOvertakesRoot(state: unknown): Record<string, unknown> {
  if (isPlainObject((state as { Overtakes?: unknown } | null)?.Overtakes)) {
    return (state as { Overtakes: Record<string, unknown> }).Overtakes;
  }
  if (isPlainObject(state)) {
    return state as Record<string, unknown>;
  }
  return {};
}

function buildDriverOvertakeRecords(
  driverKey: string,
  raw: unknown,
): OvertakeSeriesRecord[] {
  return toOrderedEntries(raw)
    .map(([sequenceKey, value]) => {
      if (!isPlainObject(value)) {
        return null;
      }

      const timestamp =
        toOptionalString(value.Timestamp) ??
        toOptionalString(value.Utc) ??
        toOptionalString(value.TimeStamp);
      const numericSequence = Number(sequenceKey);

      return {
        driverNumber: driverKey,
        sequence: Number.isFinite(numericSequence) ? numericSequence : null,
        timestamp,
        dateTime: parseOvertakeTimestamp(timestamp),
        count:
          toOptionalNumber(value.count) ??
          toOptionalNumber(value.Count) ??
          toOptionalNumber(value.Value),
        source: 'OvertakeSeries' as const,
      } satisfies OvertakeSeriesRecord;
    })
    .filter((record): record is OvertakeSeriesRecord => record !== null)
    .sort(byTimestampAscending);
}

function parseFilterTime(value: Date | string | undefined): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function byTimestampAscending(
  left: OvertakeSeriesRecord,
  right: OvertakeSeriesRecord,
) {
  if (left.dateTime && right.dateTime) {
    const delta = left.dateTime.getTime() - right.dateTime.getTime();
    if (delta !== 0) {
      return delta;
    }
  } else if (left.dateTime) {
    return -1;
  } else if (right.dateTime) {
    return 1;
  }

  const leftSequence = left.sequence ?? Number.POSITIVE_INFINITY;
  const rightSequence = right.sequence ?? Number.POSITIVE_INFINITY;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return compareMaybeNumericStrings(left.driverNumber, right.driverNumber);
}

function pickMin(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  if (!filtered.length) {
    return null;
  }
  return Math.min(...filtered);
}

function pickMax(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  if (!filtered.length) {
    return null;
  }
  return Math.max(...filtered);
}

export function getOvertakeSeriesRecords(opts: {
  overtakeSeriesState?: unknown;
  driverNumber?: string | number;
  startTime?: Date | string;
  endTime?: Date | string;
}): OvertakeSeriesRecord[] {
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);
  const startTimeMs = parseFilterTime(opts.startTime);
  const endTimeMs = parseFilterTime(opts.endTime);

  const records: OvertakeSeriesRecord[] = [];
  for (const [driverNumber, raw] of Object.entries(
    getOvertakesRoot(opts.overtakeSeriesState),
  ).sort(([left], [right]) => compareMaybeNumericStrings(left, right))) {
    if (requestedDriver !== null && driverNumber !== requestedDriver) {
      continue;
    }

    const driverRecords = buildDriverOvertakeRecords(driverNumber, raw).filter(
      (record) => {
        const timeMs = record.dateTime?.getTime() ?? null;
        if (startTimeMs !== null && timeMs !== null && timeMs < startTimeMs) {
          return false;
        }
        if (endTimeMs !== null && timeMs !== null && timeMs > endTimeMs) {
          return false;
        }
        return true;
      },
    );
    records.push(...driverRecords);
  }

  return records.sort((left, right) => {
    if (left.driverNumber !== right.driverNumber) {
      return compareMaybeNumericStrings(left.driverNumber, right.driverNumber);
    }
    return byTimestampAscending(left, right);
  });
}

export function summarizeOvertakeSeries(
  records: OvertakeSeriesRecord[],
): OvertakeSeriesSummary | null {
  if (!records.length) {
    return null;
  }

  const ordered = [...records].sort(byTimestampAscending);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  let changes = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.count !== null && current.count !== null && previous.count !== current.count) {
      changes += 1;
    }
  }

  return {
    driverNumber: first.driverNumber,
    totalEntries: ordered.length,
    firstTimestamp: first.timestamp,
    lastTimestamp: last.timestamp,
    latestCount: last.count,
    minCount: pickMin(ordered.map((record) => record.count)),
    maxCount: pickMax(ordered.map((record) => record.count)),
    changes,
  };
}
