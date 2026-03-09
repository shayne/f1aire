import { getPitStopSeriesRecords } from './pit-stop-series.js';
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

function toTyreContext(
  record: TyreStintRecord | null,
): PitStopTyreContext | null {
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

  return getPitStopSeriesRecords({
    state: opts.pitStopSeriesState,
    driverNumber: requestedDriver ?? undefined,
    startLap: startLap ?? undefined,
    endLap: endLap ?? undefined,
  }).map((record) => {
    const tyreStints = tyreStintsByDriver.get(record.driverNumber) ?? [];

    return {
      driverNumber: record.driverNumber,
      stopNumber: record.stopNumber,
      lap: record.lap,
      timestamp: record.timestamp,
      dateTime: record.dateTime,
      pitStopTime: record.pitStopTime,
      pitStopTimeMs: record.pitStopTimeMs,
      pitLaneTime: record.pitLaneTime,
      pitLaneTimeMs: record.pitLaneTimeMs,
      tyreBefore: toTyreContext(
        pickTyreBefore(tyreStints, record.lap, record.stopNumber),
      ),
      tyreAfter: toTyreContext(
        pickTyreAfter(tyreStints, record.lap, record.stopNumber),
      ),
      source: 'PitStopSeries',
    };
  });
}
