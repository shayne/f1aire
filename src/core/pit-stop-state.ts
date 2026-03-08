import { isPlainObject } from './processors/merge.js';
import { parseDurationMs } from './race-engineer-metrics.js';
import { getTyreStintRecords, type TyreStintRecord } from './tyre-state.js';

export type PitStopEventSource = 'PitStopSeries';

export type PitStopTyreContext = {
  stint: number | null;
  compound: string | null;
  isNew: boolean | null;
  tyresNotChanged: boolean | null;
  startLaps: number | null;
  totalLaps: number | null;
  lapsOnTyre: number | null;
  lapNumber: number | null;
  source: TyreStintRecord['source'];
};

export type PitStopEventRecord = {
  driverNumber: string;
  stopNumber: number | null;
  lap: number | null;
  timestamp: string | null;
  dateTime: Date | null;
  pitStopTime: string | null;
  pitStopTimeMs: number | null;
  pitLaneTime: string | null;
  pitLaneTimeMs: number | null;
  tyreBefore: PitStopTyreContext | null;
  tyreAfter: PitStopTyreContext | null;
  source: PitStopEventSource;
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

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoDate(value: unknown): Date | null {
  const text = toOptionalString(value);
  if (!text) {
    return null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function sortTyreStints(records: TyreStintRecord[]) {
  return [...records].sort((left, right) => {
    const leftStart = left.startLaps ?? Infinity;
    const rightStart = right.startLaps ?? Infinity;
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    const leftStint = left.stint ?? Infinity;
    const rightStint = right.stint ?? Infinity;
    if (leftStint !== rightStint) {
      return leftStint - rightStint;
    }
    return (left.totalLaps ?? Infinity) - (right.totalLaps ?? Infinity);
  });
}

function toTyreContext(record: TyreStintRecord | null): PitStopTyreContext | null {
  if (!record) {
    return null;
  }
  return {
    stint: record.stint,
    compound: record.compound,
    isNew: record.isNew,
    tyresNotChanged: record.tyresNotChanged,
    startLaps: record.startLaps,
    totalLaps: record.totalLaps,
    lapsOnTyre: record.lapsOnTyre,
    lapNumber: record.lapNumber,
    source: record.source,
  };
}

function pickTyreBefore(
  records: TyreStintRecord[],
  lap: number | null,
  stopNumber: number | null,
) {
  const ordered = sortTyreStints(records);
  if (lap !== null) {
    const exact = ordered.filter(
      (record) => record.totalLaps === lap || record.lapNumber === lap,
    );
    if (exact.length > 0) {
      return exact[exact.length - 1] ?? null;
    }

    let best: TyreStintRecord | null = null;
    for (const record of ordered) {
      const total = record.totalLaps;
      if (total !== null && total <= lap) {
        if (!best || (best.totalLaps ?? -Infinity) <= total) {
          best = record;
        }
      }
    }
    if (best) {
      return best;
    }

    for (const record of [...ordered].reverse()) {
      const start = record.startLaps;
      if (start !== null && start < lap) {
        return record;
      }
    }
  }

  if (stopNumber !== null) {
    return ordered[stopNumber] ?? null;
  }

  return ordered[0] ?? null;
}

function pickTyreAfter(
  records: TyreStintRecord[],
  lap: number | null,
  stopNumber: number | null,
) {
  const ordered = sortTyreStints(records);
  if (lap !== null) {
    const exact = ordered.filter((record) => record.startLaps === lap);
    if (exact.length > 0) {
      return exact[0] ?? null;
    }

    for (const record of ordered) {
      const start = record.startLaps;
      if (start !== null && start > lap) {
        return record;
      }
    }
  }

  if (stopNumber !== null) {
    return ordered[stopNumber + 1] ?? null;
  }

  return ordered[1] ?? null;
}

function buildTyreStintsByDriver(opts: {
  tyreStintSeriesState?: unknown;
  timingAppDataState?: unknown;
  timingDataState?: unknown;
}) {
  const grouped = new Map<string, TyreStintRecord[]>();
  for (const record of getTyreStintRecords(opts)) {
    const records = grouped.get(record.driverNumber) ?? [];
    records.push(record);
    grouped.set(record.driverNumber, records);
  }
  return grouped;
}

export function getPitStopEventRecords(opts: {
  pitStopSeriesState?: unknown;
  tyreStintSeriesState?: unknown;
  timingAppDataState?: unknown;
  timingDataState?: unknown;
  driverNumber?: string | number;
  startLap?: number;
  endLap?: number;
}): PitStopEventRecord[] {
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);
  const startLap = typeof opts.startLap === 'number' ? opts.startLap : null;
  const endLap = typeof opts.endLap === 'number' ? opts.endLap : null;
  const tyreStintsByDriver = buildTyreStintsByDriver({
    tyreStintSeriesState: opts.tyreStintSeriesState,
    timingAppDataState: opts.timingAppDataState,
    timingDataState: opts.timingDataState,
  });

  const pitTimes = isPlainObject(
    (opts.pitStopSeriesState as { PitTimes?: unknown } | null)?.PitTimes,
  )
    ? ((opts.pitStopSeriesState as { PitTimes: Record<string, unknown> }).PitTimes ?? {})
    : {};

  const driverNumbers = requestedDriver
    ? [requestedDriver]
    : Object.keys(pitTimes).sort(compareMaybeNumericStrings);

  const events: PitStopEventRecord[] = [];

  for (const driverNumber of driverNumbers) {
    const rawStops = pitTimes[driverNumber];
    const tyreStints = tyreStintsByDriver.get(driverNumber) ?? [];
    for (const [stopKey, rawStop] of toOrderedEntries(rawStops)) {
      if (!isPlainObject(rawStop)) {
        continue;
      }
      const nested = isPlainObject(rawStop.PitStop) ? rawStop.PitStop : rawStop;
      const stopNumber = toOptionalNumber(stopKey);
      const lap = toOptionalNumber((nested as Record<string, unknown>).Lap ?? rawStop.Lap);
      if (startLap !== null && lap !== null && lap < startLap) {
        continue;
      }
      if (endLap !== null && lap !== null && lap > endLap) {
        continue;
      }

      const timestamp =
        toOptionalString(rawStop.Timestamp)
        ?? toOptionalString((nested as Record<string, unknown>).Timestamp)
        ?? toOptionalString(rawStop.Utc)
        ?? toOptionalString((nested as Record<string, unknown>).Utc);
      const pitStopTime =
        toOptionalString((nested as Record<string, unknown>).PitStopTime)
        ?? toOptionalString(rawStop.PitStopTime);
      const pitLaneTime =
        toOptionalString((nested as Record<string, unknown>).PitLaneTime)
        ?? toOptionalString(rawStop.PitLaneTime);
      const canonicalDriver =
        toOptionalString((nested as Record<string, unknown>).RacingNumber)
        ?? driverNumber;

      events.push({
        driverNumber: canonicalDriver,
        stopNumber,
        lap,
        timestamp,
        dateTime: parseIsoDate(timestamp),
        pitStopTime,
        pitStopTimeMs: parseDurationMs(pitStopTime),
        pitLaneTime,
        pitLaneTimeMs: parseDurationMs(pitLaneTime),
        tyreBefore: toTyreContext(
          pickTyreBefore(tyreStints, lap, stopNumber),
        ),
        tyreAfter: toTyreContext(
          pickTyreAfter(tyreStints, lap, stopNumber),
        ),
        source: 'PitStopSeries',
      });
    }
  }

  events.sort((left, right) => {
    if (left.lap !== null || right.lap !== null) {
      if (left.lap === null) return 1;
      if (right.lap === null) return -1;
      if (left.lap !== right.lap) return left.lap - right.lap;
    }
    if (left.dateTime || right.dateTime) {
      if (!left.dateTime) return 1;
      if (!right.dateTime) return -1;
      const diff = left.dateTime.getTime() - right.dateTime.getTime();
      if (diff !== 0) return diff;
    }
    const driverDiff = compareMaybeNumericStrings(
      left.driverNumber,
      right.driverNumber,
    );
    if (driverDiff !== 0) {
      return driverDiff;
    }
    if (left.stopNumber !== null || right.stopNumber !== null) {
      if (left.stopNumber === null) return 1;
      if (right.stopNumber === null) return -1;
      if (left.stopNumber !== right.stopNumber) {
        return left.stopNumber - right.stopNumber;
      }
    }
    return 0;
  });

  return events;
}
