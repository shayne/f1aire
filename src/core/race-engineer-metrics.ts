import type { LapRecord } from './analysis-index.js';
import { isPlainObject } from './processors/merge.js';

export type TrackPhase = 'green' | 'yellow' | 'sc' | 'vsc' | 'red' | 'unknown';

export type PhasePeriod = {
  phase: TrackPhase;
  startLap: number;
  endLap: number;
  lapCount: number;
};

export type PhaseLapSample = {
  lap: number;
  phase: TrackPhase;
  // null when missing/excluded
  lapTimeMs: number | null;
  // For field-median this is the number of drivers contributing to the lap sample.
  // For per-driver mode this is always 1.
  sampleCount: number;
  excludedReason: string | null;
  trackStatus: { status: string | null; message: string | null } | null;
};

export type PhaseStats = {
  samples: number;
  avgLapMs: number | null;
  medianLapMs: number | null;
  minLapMs: number | null;
  maxLapMs: number | null;
  deltaToGreenMs: number | null;
};

export type ScVscDeltaReport = {
  method: 'driver' | 'field-median';
  driverNumber: string | null;
  startLap: number;
  endLap: number;
  includePitLaps: boolean;
  baseline: PhaseStats | null;
  phases: Record<TrackPhase, PhaseStats>;
  periods: PhasePeriod[];
  laps: PhaseLapSample[];
};

export type GapTrainDriver = {
  driverNumber: string;
  driverName: string | null;
  position: number | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
};

export type GapTrain = {
  size: number;
  maxIntervalToAheadSec: number | null;
  drivers: GapTrainDriver[];
};

export type GapTrainReport = {
  lap: number;
  thresholdSec: number;
  minCars: number;
  requireGreen: boolean;
  trackStatus: {
    status: string | null;
    message: string | null;
    phase: TrackPhase;
    isGreen: boolean | null;
  } | null;
  trains: GapTrain[];
  skipped: boolean;
  skippedReason: string | null;
};

export type PitLaneTimeStats = {
  source: 'PitLaneTimeCollection';
  method: 'median' | 'mean';
  driverNumber: string | null;
  startLap: number | null;
  endLap: number | null;
  samples: number;
  pitLaneTimeMs: number | null;
  pitLaneTimeSec: number | null;
  byDriver: Array<{
    driverNumber: string;
    driverName: string | null;
    samples: number;
    pitLaneTimeMs: number | null;
    pitLaneTimeSec: number | null;
  }>;
  note: string;
};

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Math.round(sum / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function phaseStats(values: number[], baselineMedianMs: number | null): PhaseStats {
  if (values.length === 0) {
    return {
      samples: 0,
      avgLapMs: null,
      medianLapMs: null,
      minLapMs: null,
      maxLapMs: null,
      deltaToGreenMs: null,
    };
  }
  const avgLapMs = mean(values);
  const medianLapMs = median(values);
  const minLapMs = Math.min(...values);
  const maxLapMs = Math.max(...values);
  const deltaToGreenMs =
    baselineMedianMs !== null && medianLapMs !== null
      ? medianLapMs - baselineMedianMs
      : null;
  return {
    samples: values.length,
    avgLapMs,
    medianLapMs,
    minLapMs,
    maxLapMs,
    deltaToGreenMs,
  };
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

export function classifyTrackPhase(status: unknown, message: unknown): TrackPhase {
  const statusText = normalizeText(status).toLowerCase();
  const messageText = normalizeText(message).toLowerCase();

  // Status code mapping (from common LiveTiming conventions).
  switch (statusText) {
    case '1':
    case 'green':
      return 'green';
    case '2':
      return 'yellow';
    case '4':
      return 'sc';
    case '5':
      return 'red';
    case '6':
    case '7':
      return 'vsc';
    default:
      break;
  }

  // Message fallback (varies by feed/year).
  if (messageText.includes('allclear') || messageText.includes('all clear')) return 'green';
  if (messageText.includes('virtual safety car') || /\bvsc\b/i.test(messageText)) return 'vsc';
  if (messageText.includes('safety car') || /\bsc\b/i.test(messageText)) return 'sc';
  if (messageText.includes('red')) return 'red';
  if (messageText.includes('yellow')) return 'yellow';

  return 'unknown';
}

export function computePhasePeriods(laps: Array<{ lap: number; phase: TrackPhase }>): PhasePeriod[] {
  const ordered = [...laps].sort((a, b) => a.lap - b.lap);
  const periods: PhasePeriod[] = [];
  let current: PhasePeriod | null = null;
  for (const item of ordered) {
    if (!current) {
      current = { phase: item.phase, startLap: item.lap, endLap: item.lap, lapCount: 1 };
      continue;
    }
    if (current.phase !== item.phase || item.lap !== current.endLap + 1) {
      periods.push(current);
      current = { phase: item.phase, startLap: item.lap, endLap: item.lap, lapCount: 1 };
      continue;
    }
    current.endLap = item.lap;
    current.lapCount += 1;
  }
  if (current) periods.push(current);
  return periods;
}

export function computeGapTrainsForLap(opts: {
  lap: number;
  lapRecords: Map<string, LapRecord>;
  thresholdSec: number;
  minCars: number;
  requireGreen: boolean;
  getDriverName?: (driverNumber: string) => string | null;
}): GapTrainReport {
  const { lap, lapRecords, thresholdSec, minCars, requireGreen } = opts;
  const getDriverName = opts.getDriverName ?? (() => null);

  const anyStatus = Array.from(lapRecords.values()).find((r) => r.trackStatus)?.trackStatus ?? null;
  const phase = anyStatus ? classifyTrackPhase(anyStatus.status, anyStatus.message) : 'unknown';
  const trackStatus = anyStatus
    ? {
        status: anyStatus.status ?? null,
        message: anyStatus.message ?? null,
        phase,
        isGreen: anyStatus.isGreen ?? null,
      }
    : null;

  const nonGreen = trackStatus && trackStatus.isGreen === false;
  if (requireGreen && nonGreen) {
    return {
      lap,
      thresholdSec,
      minCars,
      requireGreen,
      trackStatus,
      trains: [],
      skipped: true,
      skippedReason: 'non-green',
    };
  }

  const ordered = Array.from(lapRecords.values())
    .filter((r) => r.position !== null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  const trains: GapTrain[] = [];
  let current: LapRecord[] = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const rec = ordered[i];
    const gap = rec.intervalToAheadSec;
    const within = typeof gap === 'number' && Number.isFinite(gap) && gap <= thresholdSec;
    if (within) {
      if (current.length === 0) current.push(ordered[i - 1]);
      const prev = ordered[i - 1];
      if (current[current.length - 1]?.driverNumber !== prev.driverNumber) current.push(prev);
      current.push(rec);
      continue;
    }
    if (current.length >= minCars) {
      trains.push(toTrain(current, getDriverName));
    }
    current = [];
  }
  if (current.length >= minCars) trains.push(toTrain(current, getDriverName));

  return {
    lap,
    thresholdSec,
    minCars,
    requireGreen,
    trackStatus,
    trains,
    skipped: false,
    skippedReason: null,
  };
}

function toTrain(records: LapRecord[], getDriverName: (driverNumber: string) => string | null): GapTrain {
  const drivers: GapTrainDriver[] = records.map((r) => ({
    driverNumber: r.driverNumber,
    driverName: getDriverName(r.driverNumber),
    position: r.position ?? null,
    gapToLeaderSec: r.gapToLeaderSec ?? null,
    intervalToAheadSec: r.intervalToAheadSec ?? null,
  }));
  const gaps = drivers
    .map((d) => d.intervalToAheadSec)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const maxIntervalToAheadSec = gaps.length ? Math.max(...gaps) : null;
  return { size: drivers.length, maxIntervalToAheadSec, drivers };
}

function hasAnyPitFlag(record: LapRecord): boolean {
  const flags = record.flags;
  return Boolean(flags.pit || flags.pitIn || flags.pitOut || flags.inPit);
}

export function computeScVscDeltas(opts: {
  byLap: Map<number, Map<string, LapRecord>>;
  startLap: number;
  endLap: number;
  driverNumber?: string | null;
  includePitLaps?: boolean;
}): ScVscDeltaReport {
  const includePitLaps = opts.includePitLaps === true;
  const method = opts.driverNumber ? 'driver' : 'field-median';
  const driverNumber = opts.driverNumber ? String(opts.driverNumber) : null;

  const laps: PhaseLapSample[] = [];
  const phaseByLap: Array<{ lap: number; phase: TrackPhase }> = [];

  for (let lap = opts.startLap; lap <= opts.endLap; lap += 1) {
    const lapMap = opts.byLap.get(lap) ?? null;
    if (!lapMap) {
      laps.push({
        lap,
        phase: 'unknown',
        lapTimeMs: null,
        sampleCount: 0,
        excludedReason: 'missing-lap',
        trackStatus: null,
      });
      phaseByLap.push({ lap, phase: 'unknown' });
      continue;
    }

    const anyStatus = Array.from(lapMap.values()).find((r) => r.trackStatus)?.trackStatus ?? null;
    const status = anyStatus?.status ?? null;
    const message = anyStatus?.message ?? null;
    const phase = classifyTrackPhase(status, message);
    phaseByLap.push({ lap, phase });

    if (driverNumber) {
      const record = lapMap.get(driverNumber) ?? null;
      if (!record) {
        laps.push({
          lap,
          phase,
          lapTimeMs: null,
          sampleCount: 0,
          excludedReason: 'missing-driver',
          trackStatus: { status, message },
        });
        continue;
      }
      if (!includePitLaps && hasAnyPitFlag(record)) {
        laps.push({
          lap,
          phase,
          lapTimeMs: null,
          sampleCount: 1,
          excludedReason: 'pit-lap',
          trackStatus: { status, message },
        });
        continue;
      }
      if (record.lapTimeMs === null) {
        laps.push({
          lap,
          phase,
          lapTimeMs: null,
          sampleCount: 1,
          excludedReason: 'missing-lap-time',
          trackStatus: { status, message },
        });
        continue;
      }
      laps.push({
        lap,
        phase,
        lapTimeMs: record.lapTimeMs,
        sampleCount: 1,
        excludedReason: null,
        trackStatus: { status, message },
      });
      continue;
    }

    const candidates = Array.from(lapMap.values()).filter((r) => r.lapTimeMs !== null);
    const filtered = includePitLaps ? candidates : candidates.filter((r) => !hasAnyPitFlag(r));
    const values = filtered
      .map((r) => r.lapTimeMs)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (values.length === 0) {
      laps.push({
        lap,
        phase,
        lapTimeMs: null,
        sampleCount: 0,
        excludedReason: includePitLaps ? 'no-lap-times' : 'no-nonpit-lap-times',
        trackStatus: { status, message },
      });
      continue;
    }
    laps.push({
      lap,
      phase,
      lapTimeMs: median(values),
      sampleCount: values.length,
      excludedReason: null,
      trackStatus: { status, message },
    });
  }

  const periods = computePhasePeriods(phaseByLap);

  const greenValues = laps
    .filter((lap) => lap.excludedReason === null && lap.phase === 'green' && lap.lapTimeMs !== null)
    .map((lap) => lap.lapTimeMs as number);
  const baselineMedianMs = median(greenValues);
  const baseline = baselineMedianMs === null ? null : phaseStats(greenValues, baselineMedianMs);

  const phases: Record<TrackPhase, PhaseStats> = {
    green: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'green' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
    yellow: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'yellow' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
    sc: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'sc' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
    vsc: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'vsc' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
    red: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'red' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
    unknown: phaseStats(
      laps
        .filter((lap) => lap.excludedReason === null && lap.phase === 'unknown' && lap.lapTimeMs !== null)
        .map((lap) => lap.lapTimeMs as number),
      baselineMedianMs,
    ),
  };

  return {
    method,
    driverNumber,
    startLap: opts.startLap,
    endLap: opts.endLap,
    includePitLaps,
    baseline,
    phases,
    periods,
    laps,
  };
}

export function parseDurationMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 1000) : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const text = raw.replace(/^[+]/, '');
  if (/^\d+(\.\d+)?$/.test(text)) {
    const sec = Number(text);
    return Number.isFinite(sec) ? Math.round(sec * 1000) : null;
  }
  if (!text.includes(':')) return null;
  const parts = text.split(':').map((p) => p.trim());
  if (parts.some((p) => p.length === 0)) return null;
  const seconds = Number(parts[parts.length - 1]);
  if (!Number.isFinite(seconds)) return null;
  if (parts.length === 2) {
    const minutes = Number(parts[0]);
    if (!Number.isFinite(minutes)) return null;
    return Math.round((minutes * 60 + seconds) * 1000);
  }
  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }
  return null;
}

export function computePitLaneTimeStats(opts: {
  state: unknown;
  method?: 'median' | 'mean';
  driverNumber?: string | null;
  startLap?: number;
  endLap?: number;
  getDriverName?: (driverNumber: string) => string | null;
}): PitLaneTimeStats {
  const getDriverName = opts.getDriverName ?? (() => null);
  const method = opts.method === 'mean' ? 'mean' : 'median';
  const driverFilter = opts.driverNumber ? String(opts.driverNumber) : null;
  const startLap = typeof opts.startLap === 'number' ? opts.startLap : null;
  const endLap = typeof opts.endLap === 'number' ? opts.endLap : null;

  const listRaw = (opts.state as any)?.PitTimesList;
  const byDriver: PitLaneTimeStats['byDriver'] = [];
  const allDurations: number[] = [];

  if (isPlainObject(listRaw)) {
    const driverNumbers = Object.keys(listRaw).sort((a, b) => Number(a) - Number(b));
    for (const driverNumber of driverNumbers) {
      if (driverFilter && driverNumber !== driverFilter) continue;
      const pits = (listRaw as any)[driverNumber];
      if (!Array.isArray(pits)) continue;
      const durations: number[] = [];
      for (const pit of pits) {
        const lapValue = (pit as any)?.Lap;
        const lapNum = Number.isFinite(Number(lapValue)) ? Number(lapValue) : null;
        if (startLap !== null && lapNum !== null && lapNum < startLap) continue;
        if (endLap !== null && lapNum !== null && lapNum > endLap) continue;
        const ms = parseDurationMs((pit as any)?.Duration);
        if (ms === null) continue;
        durations.push(ms);
        allDurations.push(ms);
      }
      const pitLaneTimeMs =
        durations.length === 0 ? null : method === 'mean' ? mean(durations) : median(durations);
      byDriver.push({
        driverNumber,
        driverName: getDriverName(driverNumber),
        samples: durations.length,
        pitLaneTimeMs,
        pitLaneTimeSec: pitLaneTimeMs === null ? null : pitLaneTimeMs / 1000,
      });
    }
  }

  const pitLaneTimeMs =
    allDurations.length === 0 ? null : method === 'mean' ? mean(allDurations) : median(allDurations);

  return {
    source: 'PitLaneTimeCollection',
    method,
    driverNumber: driverFilter,
    startLap,
    endLap,
    samples: allDurations.length,
    pitLaneTimeMs,
    pitLaneTimeSec: pitLaneTimeMs === null ? null : pitLaneTimeMs / 1000,
    byDriver,
    note: 'PitLaneTimeCollection.Duration is pit lane traversal time only (not full pit loss including in/out lap time).',
  };
}

