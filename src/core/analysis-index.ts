import {
  extractLapTimeMs,
  parseIntervalSeconds,
  trackStatusIsGreen,
  smartGapToLeaderSeconds,
  getOrderedLines,
} from './analysis-utils.js';
import { classifyTraffic, DEFAULT_TRAFFIC_THRESHOLDS, type TrafficLabel } from './traffic.js';
import { resolveTimeCursor, type TimeCursor, type ResolvedCursor } from './time-cursor.js';

export type LapRecord = {
  lap: number;
  driverNumber: string;
  dateTime: Date | null;
  lapTimeMs: number | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
  position: number | null;
  traffic: TrafficLabel;
  trackStatus: { status: string | null; message: string | null; isGreen: boolean | null } | null;
  flags: { pit: boolean; pitIn: boolean; pitOut: boolean; inPit: boolean };
  stint: { compound: string | null; age: number | null; stint: number | null } | null;
};

export type PitEvent = { driverNumber: string; lap: number; type: 'pit' | 'pit-in' | 'pit-out' };
export type PositionChange = {
  driverNumber: string;
  lap: number;
  from: number | null;
  to: number | null;
};

export type StintPaceResult = {
  driverNumber: string;
  samples: number;
  avgLapMs: number | null;
  slopeMsPerLap: number | null;
  laps: number[];
};

export type CompareDriversResult = {
  driverA: string;
  driverB: string;
  laps: Array<{ lap: number; deltaMs: number }>;
  summary: { avgDeltaMs: number | null } | null;
};

export type UndercutWindow = {
  avgDeltaMs: number | null;
  lapsToCover: number | null;
  pitLossMs: number | null;
};

export type RejoinProjection = {
  driverNumber: string;
  asOfLap: number;
  lossMs: number;
  projectedGapToLeaderSec: number | null;
};

export type AnalysisIndex = {
  lapNumbers: number[];
  drivers: string[];
  byDriver: Map<string, LapRecord[]>;
  byLap: Map<number, Map<string, LapRecord>>;
  resolveAsOf: (cursor?: TimeCursor | null) => ResolvedCursor;
  getPitEvents: () => PitEvent[];
  getPositionChanges: () => PositionChange[];
  getStintPace: (opts: {
    driverNumber: string;
    startLap?: number;
    endLap?: number;
  }) => StintPaceResult;
  compareDrivers: (opts: {
    driverA: string;
    driverB: string;
    startLap?: number;
    endLap?: number;
  }) => CompareDriversResult;
  getUndercutWindow: (opts: {
    driverA: string;
    driverB: string;
    pitLossMs: number | null;
  }) => UndercutWindow;
  simulateRejoin: (opts: { driver: string; pitLossMs: number; asOfLap: number }) => RejoinProjection;
};

const getStintForLap = (timingAppData: any, driverNumber: string, lap: number) => {
  const lines = timingAppData?.Lines ?? {};
  const line = lines?.[driverNumber];
  const stints = line?.Stints ?? null;
  if (!stints) return null;
  const items: any[] = Array.isArray(stints)
    ? stints
    : Object.keys(stints)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => stints[key]);
  for (const stint of items) {
    const start = Number(stint?.StartLaps ?? 0);
    const total = Number(stint?.TotalLaps ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(total)) continue;
    const startLap = start + 1;
    const endLap = start + total;
    if (lap >= startLap && lap <= endLap) return stint;
  }
  return items.length ? items[items.length - 1] : null;
};

export function buildAnalysisIndex({
  processors,
}: {
  processors: any;
}): AnalysisIndex {
  const timing = processors.timingData;
  const trackStatus = processors.trackStatus;
  const timingApp = processors.timingAppData?.state ?? null;
  const byDriver = new Map<string, LapRecord[]>();
  const byLap = new Map<number, Map<string, LapRecord>>();
  const lapNumbers = timing?.getLapNumbers?.() ?? [];
  const drivers = new Set<string>();
  const lapTimes = new Map<number, Date | null>();

  for (const lap of lapNumbers) {
    const lapDrivers = timing?.driversByLap?.get(lap) ?? new Map();
    const linesObj: Record<string, any> = {};
    for (const [num, snap] of lapDrivers.entries()) linesObj[num] = snap;
    const orderedLines = getOrderedLines(linesObj);
    const gapBehindByDriver = new Map<string, number | null>();
    for (let i = 0; i < orderedLines.length; i += 1) {
      const driverNumber = orderedLines[i]?.[0];
      if (!driverNumber) continue;
      const following = orderedLines[i + 1]?.[1];
      const gapBehindSec = parseIntervalSeconds(following?.IntervalToPositionAhead?.Value);
      gapBehindByDriver.set(driverNumber, gapBehindSec);
    }
    for (const [driverNumber, snapshot] of lapDrivers.entries()) {
      drivers.add(driverNumber);
      const dt = (snapshot as any)?.__dateTime as Date | undefined;
      if (dt && !lapTimes.has(lap)) lapTimes.set(lap, dt);
      const track = dt ? trackStatus?.getAt?.(dt) : trackStatus?.state;
      const status = track ? String((track as any)?.Status ?? '') : null;
      const message = track ? String((track as any)?.Message ?? '') : null;
      const isGreen = track ? trackStatusIsGreen(status, message) : null;
      const lapTimeMs = extractLapTimeMs(snapshot, { preferPrevious: true });
      const gapToLeaderSec = smartGapToLeaderSeconds(linesObj, driverNumber);
      const intervalToAheadSec = parseIntervalSeconds(
        (snapshot as any)?.IntervalToPositionAhead?.Value,
      );

      const positionRaw = (snapshot as any)?.Position ?? (snapshot as any)?.Line;
      const position = Number.isFinite(Number(positionRaw)) ? Number(positionRaw) : null;

      const flags = {
        pit: Boolean((snapshot as any)?.IsPitLap),
        pitIn: Boolean((snapshot as any)?.PitIn),
        pitOut: Boolean((snapshot as any)?.PitOut),
        inPit: Boolean((snapshot as any)?.InPit),
      };

      const stint = getStintForLap(timingApp, driverNumber, lap);
      const stintInfo = stint
        ? {
            compound: stint?.Compound ? String(stint.Compound) : null,
            age: Number.isFinite(Number(stint?.TyreAge)) ? Number(stint.TyreAge) : null,
            stint: Number.isFinite(Number(stint?.Stint)) ? Number(stint.Stint) : null,
          }
        : null;

      const traffic = classifyTraffic({
        gapAheadSec: intervalToAheadSec,
        gapBehindSec: gapBehindByDriver.get(driverNumber) ?? null,
        lapTimeMs,
        isGreen,
        thresholds: DEFAULT_TRAFFIC_THRESHOLDS,
      });

      const record: LapRecord = {
        lap,
        driverNumber,
        dateTime: dt ?? null,
        lapTimeMs,
        gapToLeaderSec,
        intervalToAheadSec,
        position,
        traffic,
        trackStatus: track
          ? { status, message, isGreen }
          : null,
        flags,
        stint: stintInfo,
      };

      if (!byDriver.has(driverNumber)) byDriver.set(driverNumber, []);
      byDriver.get(driverNumber)?.push(record);
      if (!byLap.has(lap)) byLap.set(lap, new Map());
      byLap.get(lap)?.set(driverNumber, record);
    }
  }

  for (const list of byDriver.values()) list.sort((a, b) => a.lap - b.lap);

  const pitEvents: PitEvent[] = [];
  const positionChanges: PositionChange[] = [];

  for (const [driverNumber, records] of byDriver.entries()) {
    for (const record of records) {
      if (record.flags.pitIn) pitEvents.push({ driverNumber, lap: record.lap, type: 'pit-in' });
      else if (record.flags.pitOut)
        pitEvents.push({ driverNumber, lap: record.lap, type: 'pit-out' });
      else if (record.flags.pit) pitEvents.push({ driverNumber, lap: record.lap, type: 'pit' });
    }
  }

  const sortedLaps = [...lapNumbers].sort((a, b) => a - b);
  for (let i = 1; i < sortedLaps.length; i += 1) {
    const prevLap = sortedLaps[i - 1];
    const lap = sortedLaps[i];
    const prevSnap = byLap.get(prevLap) ?? new Map();
    const currSnap = byLap.get(lap) ?? new Map();
    for (const [driverNumber, current] of currSnap.entries()) {
      const prev = prevSnap.get(driverNumber);
      if (!prev) continue;
      if (prev.position !== current.position) {
        positionChanges.push({
          driverNumber,
          lap,
          from: prev.position ?? null,
          to: current.position ?? null,
        });
      }
    }
  }

  const getDriverLaps = (driverNumber: string, startLap?: number, endLap?: number) => {
    const records = byDriver.get(driverNumber) ?? [];
    return records.filter((r) => {
      if (typeof startLap === 'number' && r.lap < startLap) return false;
      if (typeof endLap === 'number' && r.lap > endLap) return false;
      return r.lapTimeMs !== null;
    });
  };

  const getStintPace = ({
    driverNumber,
    startLap,
    endLap,
  }: {
    driverNumber: string;
    startLap?: number;
    endLap?: number;
  }): StintPaceResult => {
    const records = getDriverLaps(driverNumber, startLap, endLap);
    const times = records.map((r) => r.lapTimeMs ?? 0);
    if (!records.length) {
      return { driverNumber, samples: 0, avgLapMs: null, slopeMsPerLap: null, laps: [] };
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const first = records[0];
    const last = records[records.length - 1];
    const lapDelta = last.lap - first.lap;
    const slope = lapDelta > 0 ? (times[times.length - 1] - times[0]) / lapDelta : 0;
    return {
      driverNumber,
      samples: records.length,
      avgLapMs: avg,
      slopeMsPerLap: slope,
      laps: records.map((r) => r.lap),
    };
  };

  const compareDrivers = ({
    driverA,
    driverB,
    startLap,
    endLap,
  }: {
    driverA: string;
    driverB: string;
    startLap?: number;
    endLap?: number;
  }): CompareDriversResult => {
    const a = getDriverLaps(driverA, startLap, endLap);
    const b = getDriverLaps(driverB, startLap, endLap);
    const laps = a
      .map((r) => ({ lap: r.lap, a: r.lapTimeMs }))
      .filter((r) => b.some((x) => x.lap === r.lap))
      .map((r) => {
        const bLap = b.find((x) => x.lap === r.lap);
        return { lap: r.lap, deltaMs: (r.a ?? 0) - (bLap?.lapTimeMs ?? 0) };
      });
    const avgDelta = laps.length ? laps.reduce((sum, row) => sum + row.deltaMs, 0) / laps.length : null;
    return {
      driverA,
      driverB,
      laps,
      summary: laps.length ? { avgDeltaMs: avgDelta } : null,
    };
  };

  const getUndercutWindow = ({
    driverA,
    driverB,
    pitLossMs,
  }: {
    driverA: string;
    driverB: string;
    pitLossMs: number | null;
  }): UndercutWindow => {
    const comparison = compareDrivers({ driverA, driverB });
    const avgDelta = comparison.summary?.avgDeltaMs ?? null;
    if (!avgDelta || !pitLossMs) {
      return { avgDeltaMs: avgDelta, lapsToCover: null, pitLossMs: pitLossMs ?? null };
    }
    const lapsToCover =
      avgDelta < 0
        ? Math.ceil(pitLossMs / Math.abs(avgDelta))
        : Math.ceil(pitLossMs / Math.max(1, avgDelta));
    return { avgDeltaMs: avgDelta, lapsToCover, pitLossMs };
  };

  const simulateRejoin = ({
    driver,
    pitLossMs,
    asOfLap,
  }: {
    driver: string;
    pitLossMs: number;
    asOfLap: number;
  }): RejoinProjection => {
    const snap = byLap.get(asOfLap)?.get(driver);
    const gapToLeader = snap?.gapToLeaderSec ?? null;
    const projectedGap = gapToLeader === null ? null : gapToLeader + pitLossMs / 1000;
    return {
      driverNumber: driver,
      asOfLap,
      lossMs: pitLossMs,
      projectedGapToLeaderSec: projectedGap,
    };
  };

  return {
    lapNumbers: [...lapNumbers],
    drivers: Array.from(drivers.values()),
    byDriver,
    byLap,
    resolveAsOf: (cursor?: TimeCursor | null) =>
      resolveTimeCursor({ lapTimes, lapNumbers, cursor }),
    getPitEvents: () => pitEvents,
    getPositionChanges: () => positionChanges,
    getStintPace,
    compareDrivers,
    getUndercutWindow,
    simulateRejoin,
  };
}
