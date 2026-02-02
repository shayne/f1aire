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

export type AnalysisIndex = {
  lapNumbers: number[];
  drivers: string[];
  byDriver: Map<string, LapRecord[]>;
  byLap: Map<number, Map<string, LapRecord>>;
  resolveAsOf: (cursor?: TimeCursor | null) => ResolvedCursor;
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

  return {
    lapNumbers: [...lapNumbers],
    drivers: Array.from(drivers.values()),
    byDriver,
    byLap,
    resolveAsOf: (cursor?: TimeCursor | null) =>
      resolveTimeCursor({ lapTimes, lapNumbers, cursor }),
  };
}
