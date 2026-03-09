import type { SessionStore } from './session-store.js';
import type { TimingService } from './timing-service.js';
import { buildAnalysisIndex } from './analysis-index.js';
import { isPlainObject } from './processors/merge.js';
import { normalizePoint } from './processors/normalize.js';
import {
  getTopicDefinition,
  type TopicAvailability,
  type TopicUpdateSemantics,
} from './topic-registry.js';
import type { TimeCursor } from './time-cursor.js';

type RawPoint = SessionStore['raw']['live'][number];

type SerializedResolvedCursor = {
  lap: number | null;
  dateTime: string | null;
  source: 'latest' | 'lap' | 'time' | 'none';
};

export type OperatorTopicSnapshot = {
  topic: string;
  streamName: string | null;
  availability: TopicAvailability | null;
  semantics: TopicUpdateSemantics | null;
  source: 'processor' | 'raw';
  dateTime: string | null;
  data: unknown;
};

export type ReplayLapRange = {
  firstLap: number;
  lastLap: number;
  totalLaps: number;
};

export type ReplayControlState = {
  sessionLoaded: boolean;
  sessionName: string | null;
  cursor: TimeCursor;
  resolved: SerializedResolvedCursor;
  lapRange: ReplayLapRange | null;
};

export type ReplayControlOperation =
  | 'set-latest'
  | 'set-lap'
  | 'set-time'
  | 'step-lap'
  | 'step-time';

export type ReplayControlRequest =
  | { operation: 'set-latest' }
  | { operation: 'set-lap'; lap: number }
  | { operation: 'set-time'; iso: string }
  | { operation: 'step-lap'; delta?: number }
  | { operation: 'step-time'; deltaMs: number };

export type ReplayControlErrorCode =
  | 'invalid-request'
  | 'unknown-operation'
  | 'no-laps';

export type ReplayControlError = {
  errorCode: ReplayControlErrorCode;
  errorMessage: string;
};

export type ReplayControlResult =
  | { ok: true; value: ReplayControlState }
  | { ok: false; error: ReplayControlError };

export type TimingLapDriverSnapshot = {
  driverNumber: string;
  driverName: string | null;
  snapshot: unknown;
};

export type TimingLapResponse = {
  requestedLap: number | null;
  resolvedLap: number;
  source: SerializedResolvedCursor['source'];
  dateTime: string | null;
  totalDrivers: number;
  drivers: TimingLapDriverSnapshot[];
};

export type BestLapRecord = {
  driverNumber: string;
  driverName: string | null;
  time: string;
  timeMs: number;
  lap: number | null;
  snapshot?: unknown;
};

export type BestLapsResponse = {
  totalDrivers: number;
  records: BestLapRecord[];
};

export type OperatorApi = {
  getLatest: (topic: string) => OperatorTopicSnapshot | null;
  getTimingLap: (options?: {
    lap?: number;
    driverNumber?: string | number;
  }) => TimingLapResponse | null;
  getBestLaps: (options?: {
    driverNumber?: string | number;
    limit?: number;
    includeSnapshot?: boolean;
  }) => BestLapsResponse;
  getControlState: () => ReplayControlState;
  applyControl: (request: ReplayControlRequest) => ReplayControlResult;
};

function canonicalizeTopicName(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith('.z') ? trimmed.slice(0, -2) : trimmed;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = serializeValue(entry);
    }
    return out;
  }
  return value;
}

function getRawLatest(store: SessionStore, topic: string): RawPoint | null {
  const direct = store.topic(topic).latest as RawPoint | null;
  return direct ?? (store.topic(`${topic}.z`).latest as RawPoint | null);
}

function getDriverName(
  service: TimingService,
  driverNumber: string,
): string | null {
  return service.processors.driverList?.getName?.(driverNumber) ?? null;
}

function getTopicState(service: TimingService, topic: string): unknown | null {
  switch (topic) {
    case 'SessionInfo':
      return service.processors.sessionInfo?.state ?? null;
    case 'Heartbeat':
      return service.processors.heartbeat?.state ?? null;
    case 'DriverList':
      return service.processors.driverList?.state ?? null;
    case 'TimingData':
      return service.processors.timingData?.state ?? null;
    case 'TimingAppData':
      return service.processors.timingAppData?.state ?? null;
    case 'TimingStats':
      return service.processors.timingStats?.state ?? null;
    case 'TrackStatus':
      return service.processors.trackStatus?.state ?? null;
    case 'LapCount':
      return service.processors.lapCount?.state ?? null;
    case 'WeatherData':
      return service.processors.weatherData?.state ?? null;
    case 'SessionData':
      return service.processors.sessionData?.state ?? null;
    case 'ExtrapolatedClock':
      return service.processors.extrapolatedClock?.state ?? null;
    case 'TopThree':
      return service.processors.topThree?.state ?? null;
    case 'DriverTracker':
      return service.processors.driverTracker?.state ?? null;
    case 'RaceControlMessages':
      return service.processors.raceControlMessages?.state ?? null;
    case 'TeamRadio':
      return service.processors.teamRadio?.state ?? null;
    case 'ChampionshipPrediction':
      return service.processors.championshipPrediction?.state ?? null;
    case 'DriverRaceInfo':
      return service.processors.driverRaceInfo?.state ?? null;
    case 'PitStopSeries':
      return service.processors.pitStopSeries?.state ?? null;
    case 'PitStop':
      return service.processors.pitStop?.state ?? null;
    case 'PitLaneTimeCollection':
      return service.processors.pitLaneTimeCollection?.state ?? null;
    case 'CarData':
      return service.processors.carData?.state ?? null;
    case 'Position':
      return service.processors.position?.state ?? null;
    default:
      return service.processors.extraTopics?.[topic]?.state ?? null;
  }
}

function getSessionName(service: TimingService): string | null {
  const state = service.processors.sessionInfo?.state as
    | { Name?: unknown; Meeting?: { Name?: unknown } }
    | null
    | undefined;
  const direct =
    typeof state?.Name === 'string' && state.Name.trim().length > 0
      ? state.Name.trim()
      : null;
  if (direct) {
    return direct;
  }
  return typeof state?.Meeting?.Name === 'string' &&
    state.Meeting.Name.trim().length > 0
    ? state.Meeting.Name.trim()
    : null;
}

function getLapRange(lapNumbers: number[]): ReplayLapRange | null {
  if (lapNumbers.length === 0) {
    return null;
  }
  const sorted = [...lapNumbers].sort((a, b) => a - b);
  return {
    firstLap: sorted[0]!,
    lastLap: sorted[sorted.length - 1]!,
    totalLaps: sorted.length,
  };
}

function serializeResolvedCursor(resolved: {
  lap: number | null;
  dateTime: Date | null;
  source: 'latest' | 'lap' | 'time' | 'none';
}): SerializedResolvedCursor {
  return {
    lap: resolved.lap,
    dateTime: resolved.dateTime?.toISOString() ?? null,
    source: resolved.source,
  };
}

function normalizeCursor(
  requested: TimeCursor,
  resolved: { lap: number | null; source: SerializedResolvedCursor['source'] },
): TimeCursor {
  if (resolved.source === 'latest' || typeof resolved.lap !== 'number') {
    return { latest: true };
  }
  if (requested.iso) {
    return { lap: resolved.lap, iso: requested.iso, latest: false };
  }
  return { lap: resolved.lap };
}

function parseCursorIso(cursor: TimeCursor): Date | null {
  if (typeof cursor.iso !== 'string' || cursor.iso.trim().length === 0) {
    return null;
  }

  const parsed = new Date(cursor.iso);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function sortTimingSnapshots(entries: Array<[string, unknown]>) {
  return [...entries].sort(([leftNumber, left], [rightNumber, right]) => {
    const leftPosition = Number(
      (left as any)?.Position ?? (left as any)?.Line ?? Infinity,
    );
    const rightPosition = Number(
      (right as any)?.Position ?? (right as any)?.Line ?? Infinity,
    );
    if (Number.isFinite(leftPosition) || Number.isFinite(rightPosition)) {
      if (!Number.isFinite(leftPosition)) return 1;
      if (!Number.isFinite(rightPosition)) return -1;
      if (leftPosition !== rightPosition) return leftPosition - rightPosition;
    }
    return leftNumber.localeCompare(rightNumber);
  });
}

function buildControlState(
  store: SessionStore,
  service: TimingService,
  currentCursor: TimeCursor,
): ReplayControlState {
  const analysisIndex = buildAnalysisIndex({ processors: service.processors });
  const resolved = analysisIndex.resolveAsOf(currentCursor);
  return {
    sessionLoaded:
      Boolean(getSessionName(service)) ||
      store.raw.live.length > 0 ||
      Object.keys(store.raw.subscribe ?? {}).length > 0,
    sessionName: getSessionName(service),
    cursor: { ...currentCursor },
    resolved: serializeResolvedCursor(resolved),
    lapRange: getLapRange(analysisIndex.lapNumbers),
  };
}

function createControlError(
  errorCode: ReplayControlErrorCode,
  errorMessage: string,
): ReplayControlResult {
  return { ok: false, error: { errorCode, errorMessage } };
}

export function createOperatorApi({
  store,
  service,
  timeCursor = { latest: true },
  onTimeCursorChange,
}: {
  store: SessionStore;
  service: TimingService;
  timeCursor?: TimeCursor;
  onTimeCursorChange?: (cursor: TimeCursor) => void;
}): OperatorApi {
  let currentCursor: TimeCursor = { ...timeCursor };

  const getLatest = (topic: string): OperatorTopicSnapshot | null => {
    const canonicalTopic = canonicalizeTopicName(topic);
    const definition = getTopicDefinition(canonicalTopic);
    const mergedState = getTopicState(service, canonicalTopic);
    const fallback = getRawLatest(store, canonicalTopic);

    if (mergedState !== null) {
      return {
        topic: definition?.topic ?? canonicalTopic,
        streamName: definition?.streamName ?? null,
        availability: definition?.availability ?? null,
        semantics: definition?.semantics ?? null,
        source: 'processor',
        dateTime: fallback?.dateTime?.toISOString() ?? null,
        data: serializeValue(structuredClone(mergedState)),
      };
    }

    if (!fallback) {
      return null;
    }

    const normalized = normalizePoint(fallback);
    return {
      topic: definition?.topic ?? canonicalTopic,
      streamName: definition?.streamName ?? fallback.type,
      availability: definition?.availability ?? null,
      semantics: definition?.semantics ?? null,
      source: 'raw',
      dateTime: normalized.dateTime?.toISOString() ?? null,
      data: serializeValue(normalized.json),
    };
  };

  const getTimingLap: OperatorApi['getTimingLap'] = (options = {}) => {
    const analysisIndex = buildAnalysisIndex({
      processors: service.processors,
    });
    const requestedCursor: TimeCursor =
      typeof options.lap === 'number' ? { lap: options.lap } : currentCursor;
    const resolved = analysisIndex.resolveAsOf(requestedCursor);
    if (typeof resolved.lap !== 'number') {
      return null;
    }

    const lapDrivers = service.processors.timingData?.driversByLap?.get(
      resolved.lap,
    );
    if (!lapDrivers) {
      return null;
    }

    let entries = sortTimingSnapshots(Array.from(lapDrivers.entries()));
    if (options.driverNumber !== undefined) {
      const target = String(options.driverNumber);
      entries = entries.filter(([driverNumber]) => driverNumber === target);
    }

    return {
      requestedLap:
        typeof options.lap === 'number'
          ? options.lap
          : typeof currentCursor.lap === 'number'
            ? currentCursor.lap
            : null,
      resolvedLap: resolved.lap,
      source: resolved.source,
      dateTime: resolved.dateTime?.toISOString() ?? null,
      totalDrivers: entries.length,
      drivers: entries.map(([driverNumber, snapshot]) => ({
        driverNumber,
        driverName: getDriverName(service, driverNumber),
        snapshot: serializeValue(structuredClone(snapshot)),
      })),
    };
  };

  const getBestLaps: OperatorApi['getBestLaps'] = (options = {}) => {
    const records = Array.from(service.processors.timingData?.bestLaps ?? [])
      .filter(([driverNumber]) =>
        options.driverNumber === undefined
          ? true
          : driverNumber === String(options.driverNumber),
      )
      .map(([driverNumber, value]) => ({
        driverNumber,
        driverName: getDriverName(service, driverNumber),
        time: value.time,
        timeMs: value.timeMs,
        lap: value.lap,
        ...(options.includeSnapshot
          ? { snapshot: serializeValue(structuredClone(value.snapshot)) }
          : {}),
      }))
      .sort((left, right) => {
        if (left.timeMs !== right.timeMs) {
          return left.timeMs - right.timeMs;
        }
        return left.driverNumber.localeCompare(right.driverNumber);
      });

    const limited =
      typeof options.limit === 'number' && options.limit > 0
        ? records.slice(0, options.limit)
        : records;

    return {
      totalDrivers: limited.length,
      records: limited,
    };
  };

  const getControlState = () =>
    buildControlState(store, service, currentCursor);

  const applyControl: OperatorApi['applyControl'] = (request) => {
    const analysisIndex = buildAnalysisIndex({
      processors: service.processors,
    });
    const lapRange = getLapRange(analysisIndex.lapNumbers);

    const commitCursor = (requested: TimeCursor): ReplayControlResult => {
      const resolved = analysisIndex.resolveAsOf(requested);
      currentCursor = normalizeCursor(requested, {
        lap: resolved.lap,
        source: resolved.source,
      });
      onTimeCursorChange?.(currentCursor);
      return {
        ok: true,
        value: {
          sessionLoaded:
            Boolean(getSessionName(service)) ||
            store.raw.live.length > 0 ||
            Object.keys(store.raw.subscribe ?? {}).length > 0,
          sessionName: getSessionName(service),
          cursor: { ...currentCursor },
          resolved: serializeResolvedCursor(resolved),
          lapRange,
        },
      };
    };

    switch (request.operation) {
      case 'set-latest':
        return commitCursor({ latest: true });
      case 'set-lap': {
        if (!Number.isFinite(request.lap)) {
          return createControlError(
            'invalid-request',
            'set-lap requires a finite lap number.',
          );
        }
        if (!lapRange) {
          return createControlError(
            'no-laps',
            'No lap snapshots are available for replay control.',
          );
        }
        return commitCursor({ lap: request.lap });
      }
      case 'set-time': {
        if (
          typeof request.iso !== 'string' ||
          request.iso.trim().length === 0
        ) {
          return createControlError(
            'invalid-request',
            'set-time requires a non-empty ISO timestamp.',
          );
        }
        const parsed = new Date(request.iso);
        if (!Number.isFinite(parsed.getTime())) {
          return createControlError(
            'invalid-request',
            'set-time requires a valid ISO timestamp.',
          );
        }
        if (!lapRange) {
          return createControlError(
            'no-laps',
            'No lap snapshots are available for replay control.',
          );
        }
        return commitCursor({ iso: request.iso });
      }
      case 'step-lap': {
        if (!lapRange) {
          return createControlError(
            'no-laps',
            'No lap snapshots are available for replay control.',
          );
        }
        const current = analysisIndex.resolveAsOf(currentCursor);
        const startingLap =
          typeof current.lap === 'number' ? current.lap : lapRange.lastLap;
        const delta =
          typeof request.delta === 'number' && Number.isFinite(request.delta)
            ? Math.trunc(request.delta)
            : 1;
        return commitCursor({ lap: startingLap + delta });
      }
      case 'step-time': {
        if (!Number.isFinite(request.deltaMs)) {
          return createControlError(
            'invalid-request',
            'step-time requires a finite deltaMs value.',
          );
        }
        if (!lapRange) {
          return createControlError(
            'no-laps',
            'No lap snapshots are available for replay control.',
          );
        }

        const current = analysisIndex.resolveAsOf(currentCursor);
        const baseTime = parseCursorIso(currentCursor) ?? current.dateTime;
        if (!baseTime) {
          return createControlError(
            'invalid-request',
            'step-time requires replay timestamps to be available.',
          );
        }

        return commitCursor({
          iso: new Date(
            baseTime.getTime() + Math.trunc(request.deltaMs),
          ).toISOString(),
        });
      }
      default:
        return createControlError(
          'unknown-operation',
          'Unknown replay control operation requested.',
        );
    }
  };

  return {
    getLatest,
    getTimingLap,
    getBestLaps,
    getControlState,
    applyControl,
  };
}
