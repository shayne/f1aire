import type { SessionStore } from './session-store.js';
import type { RawPoint } from './processors/types.js';
import {
  decodeCarChannels,
  extractLapTimeMs,
  extractSegmentStatuses,
  extractSectorTimesMs,
  isCleanLap,
  parseGapSeconds,
  parseIntervalSeconds,
  smartGapToLeaderSeconds,
  trackStatusIsGreen,
  isPitLap,
} from './analysis-utils.js';
import { normalizePoint } from './processors/normalize.js';
import { isPlainObject } from './processors/merge.js';

type TrackStatusProcessorLike = {
  state?: unknown | null;
  history?: Array<{ at: Date; value: unknown; status: string | null; message: string | null }>;
  getAt?: (dateTime: Date) => unknown | null;
};

type TimingDataProcessorLike = {
  state?: unknown | null;
  driversByLap?: Map<number, Map<string, unknown>>;
  getLapHistory?: (driverNumber: string) => Array<{ lap: number; snapshot: unknown }>;
  getLapSnapshot?: (driverNumber: string, lap: number) => unknown | null;
  getLapNumbers?: () => number[];
};

type DriverListProcessorLike = {
  state?: Record<string, unknown> | null;
  getName?: (driverNumber: string) => string | null;
};

type TimingAppProcessorLike = { state?: unknown | null };

type ProcessorsLike = {
  timingData?: TimingDataProcessorLike;
  driverList?: DriverListProcessorLike;
  timingAppData?: TimingAppProcessorLike;
  trackStatus?: TrackStatusProcessorLike;
};

type LapTableOptions = {
  driverNumbers?: Array<string | number>;
  startLap?: number;
  endLap?: number;
  limit?: number;
  includeTrackStatus?: boolean;
  includeStints?: boolean;
  includeGaps?: boolean;
  includeSectors?: boolean;
  includeSegments?: boolean;
  includeSpeeds?: boolean;
  includePitFlags?: boolean;
  requireGreen?: boolean;
};

function normalizeDriverNumber(value: string | number) {
  return String(value);
}

function getDriverListMap(processors: ProcessorsLike) {
  const raw = processors.driverList?.state ?? {};
  if (!isPlainObject(raw)) return new Map<string, Record<string, unknown>>();
  const map = new Map<string, Record<string, unknown>>();
  for (const [num, data] of Object.entries(raw)) {
    if (num === '_kf') continue;
    if (isPlainObject(data)) map.set(num, data as Record<string, unknown>);
  }
  return map;
}

function getDriverName(processors: ProcessorsLike, driverNumber: string) {
  return processors.driverList?.getName?.(driverNumber) ?? null;
}

function getTrackStatusAt(processors: ProcessorsLike, dateTime: Date | undefined) {
  if (!dateTime) return processors.trackStatus?.state ?? null;
  return processors.trackStatus?.getAt?.(dateTime) ?? processors.trackStatus?.state ?? null;
}

function getStintsForDriver(processors: ProcessorsLike, driverNumber: string) {
  const app = processors.timingAppData?.state as any;
  const lines = app?.Lines ?? {};
  const line = lines?.[driverNumber];
  if (!line) return null;
  const stints = line.Stints ?? {};
  if (Array.isArray(stints)) return stints;
  if (isPlainObject(stints)) {
    return Object.keys(stints)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (stints as any)[key]);
  }
  return null;
}

function getStintForLap(
  processors: ProcessorsLike,
  driverNumber: string,
  lap: number,
) {
  const stints = getStintsForDriver(processors, driverNumber);
  if (!stints) return null;
  for (const stint of stints) {
    const start = Number((stint as any)?.StartLaps ?? 0);
    const total = Number((stint as any)?.TotalLaps ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(total)) continue;
    if (total <= 0) continue;
    const startLap = start + 1;
    const endLap = start + total;
    if (lap >= startLap && lap <= endLap) return stint;
  }
  return stints.length > 0 ? stints[stints.length - 1] : null;
}

function extractSpeeds(snapshot: unknown) {
  const speeds = (snapshot as any)?.Speeds;
  if (!isPlainObject(speeds)) return null;
  const read = (key: string) => {
    const value = (speeds as any)[key]?.Value;
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    i1: read('I1'),
    i2: read('I2'),
    fl: read('FL'),
    st: read('ST'),
  };
}

export function createAnalysisContext(opts: {
  store: SessionStore;
  processors: ProcessorsLike;
}) {
  const { store, processors } = opts;
  const driverMap = getDriverListMap(processors);

  const getDrivers = () => {
    const out: Array<Record<string, unknown>> = [];
    for (const [num, data] of driverMap.entries()) {
      out.push({
        number: num,
        name:
          (data as any)?.FullName
          ?? (data as any)?.BroadcastName
          ?? (data as any)?.Tla
          ?? num,
        team: (data as any)?.TeamName ?? null,
        teamColour: (data as any)?.TeamColour ?? null,
        data,
      });
    }
    return out;
  };

  const getDriverNumberByName = (name: string) => {
    const needle = name.toLowerCase();
    for (const [num, data] of driverMap.entries()) {
      const full = String((data as any)?.FullName ?? '').toLowerCase();
      const broadcast = String((data as any)?.BroadcastName ?? '').toLowerCase();
      const tla = String((data as any)?.Tla ?? '').toLowerCase();
      if (full.includes(needle) || broadcast.includes(needle) || tla === needle) {
        return num;
      }
    }
    return null;
  };

  const getTopicStats = () => {
    const counts = new Map<string, number>();
    const first = new Map<string, Date>();
    const last = new Map<string, Date>();
    for (const point of store.raw.live as RawPoint[]) {
      const count = counts.get(point.type) ?? 0;
      counts.set(point.type, count + 1);
      if (!first.has(point.type)) first.set(point.type, point.dateTime);
      last.set(point.type, point.dateTime);
    }
    return Array.from(counts.entries()).map(([type, count]) => ({
      type,
      count,
      first: first.get(type) ?? null,
      last: last.get(type) ?? null,
    }));
  };

  const getLapTable = (options: LapTableOptions = {}) => {
    const timing = processors.timingData;
    if (!timing) return [];
    const lapNumbers = timing.getLapNumbers?.() ?? [];
    if (!lapNumbers.length) return [];
    let laps = lapNumbers;
    const startLap = options.startLap;
    const endLap = options.endLap;
    if (typeof startLap === 'number') laps = laps.filter((lap) => lap >= startLap);
    if (typeof endLap === 'number') laps = laps.filter((lap) => lap <= endLap);
    if (typeof options.limit === 'number' && options.limit > 0) laps = laps.slice(-options.limit);
    const driverFilter = options.driverNumbers
      ? new Set(options.driverNumbers.map(normalizeDriverNumber))
      : null;
    const includeTrack = options.includeTrackStatus ?? true;
    const includeStints = options.includeStints ?? true;
    const includeGaps = options.includeGaps ?? true;
    const includeSectors = options.includeSectors ?? true;
    const includeSegments = options.includeSegments ?? false;
    const includeSpeeds = options.includeSpeeds ?? false;
    const includePitFlags = options.includePitFlags ?? true;
    const requireGreen = options.requireGreen ?? false;

    const rows: Array<Record<string, unknown>> = [];
    for (const lap of laps) {
      const lapDrivers = timing.driversByLap?.get(lap) ?? new Map();
      const linesObj: Record<string, any> = {};
      for (const [num, snap] of lapDrivers.entries()) {
        linesObj[num] = snap;
      }
      for (const [driverNumber, snapshot] of lapDrivers.entries()) {
        if (driverFilter && !driverFilter.has(driverNumber)) continue;
        const dt = (snapshot as any)?.__dateTime as Date | undefined;
        const track = includeTrack ? getTrackStatusAt(processors, dt) : null;
        if (requireGreen && track) {
          if (!trackStatusIsGreen((track as any)?.Status, (track as any)?.Message)) continue;
        }

        const sectorsMs = includeSectors
          ? extractSectorTimesMs(snapshot, { preferPrevious: true })
          : null;
        const segmentStatuses = includeSegments
          ? extractSegmentStatuses(snapshot)
          : null;
        const lapTimeMs = extractLapTimeMs(snapshot, { preferPrevious: true });
        const speeds = includeSpeeds ? extractSpeeds(snapshot) : null;
        const stint = includeStints ? getStintForLap(processors, driverNumber, lap) : null;

        const gapToLeader = (snapshot as any)?.GapToLeader ?? null;
        const intervalToAhead = (snapshot as any)?.IntervalToPositionAhead?.Value ?? null;
        const gapSeconds = includeGaps ? parseGapSeconds(gapToLeader) : null;
        const intervalSeconds = includeGaps ? parseIntervalSeconds(intervalToAhead) : null;
        const smartGap = includeGaps ? smartGapToLeaderSeconds(linesObj, driverNumber) : null;

        rows.push({
          lap,
          driverNumber,
          driverName: getDriverName(processors, driverNumber),
          position: (snapshot as any)?.Line ?? (snapshot as any)?.Position ?? null,
          lapTimeMs,
          sectorsMs,
          segmentStatuses,
          gapToLeader,
          gapToLeaderSeconds: gapSeconds,
          intervalToAhead,
          intervalToAheadSeconds: intervalSeconds,
          smartGapToLeaderSeconds: smartGap,
          speeds,
          trackStatus: track
            ? {
                status: (track as any)?.Status ?? null,
                message: (track as any)?.Message ?? null,
              }
            : null,
          stint: stint ?? null,
          isPitLap: includePitFlags ? isPitLap(snapshot) : null,
          inPit: includePitFlags ? Boolean((snapshot as any)?.InPit) : null,
          pitOut: includePitFlags ? Boolean((snapshot as any)?.PitOut) : null,
          pitIn: includePitFlags ? Boolean((snapshot as any)?.PitIn) : null,
          isCleanLap: includePitFlags ? isCleanLap(snapshot, track, true) : null,
        });
      }
    }
    return rows;
  };

  const getTopicTimeline = (topic: string, options?: { limit?: number; from?: Date; to?: Date }) => {
    const view = store.topic(topic);
    let timeline = view.timeline(options?.from, options?.to);
    if (!timeline.length && !topic.endsWith('.z')) {
      timeline = store.topic(`${topic}.z`).timeline(options?.from, options?.to);
    }
    const normalized = timeline.map((point) => normalizePoint(point));
    if (typeof options?.limit === 'number' && options.limit > 0) {
      return normalized.slice(-options.limit);
    }
    return normalized;
  };

  const getLatestCarTelemetry = (driverNumber?: string) => {
    const entry = (processors as any)?.carData?.state?.Entries?.slice?.(-1)?.[0];
    if (!entry) return null;
    const cars = entry?.Cars ?? {};
    if (!isPlainObject(cars)) return null;
    if (driverNumber) {
      const car = (cars as any)[driverNumber];
      const channels = (car as any)?.Channels ?? null;
      return {
        utc: entry?.Utc ?? null,
        driverNumber,
        channels: decodeCarChannels(channels),
      };
    }
    const all: Record<string, unknown> = {};
    for (const [num, car] of Object.entries(cars)) {
      all[num] = decodeCarChannels((car as any)?.Channels ?? null);
    }
    return { utc: entry?.Utc ?? null, drivers: all };
  };

  return {
    getDrivers,
    getDriverName: (num: string) => getDriverName(processors, num),
    getDriverNumberByName,
    getStintsForDriver: (num: string) => getStintsForDriver(processors, num),
    getStintForLap: (num: string, lap: number) => getStintForLap(processors, num, lap),
    getTrackStatusAt: (dateTime: Date | undefined) => getTrackStatusAt(processors, dateTime),
    getLapTable,
    getTopicStats,
    getTopicTimeline,
    getLatestCarTelemetry,
  };
}
