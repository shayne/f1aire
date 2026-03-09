import type { SessionStore } from './session-store.js';
import type { TimingService } from './timing-service.js';
import { buildAnalysisIndex, type LapRecord } from './analysis-index.js';
import { isPlainObject } from './processors/merge.js';
import { normalizePoint } from './processors/normalize.js';
import {
  buildSessionDataState,
  buildSessionLifecycleSnapshot,
  type SessionArchiveStatus,
  type SessionLifecycleEvent,
  type SessionLifecycleStatus,
} from './session-lifecycle.js';
import {
  getSessionStaticPrefix,
  getTeamRadioCaptures,
  type TeamRadioCaptureSummary,
} from './team-radio.js';
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

export type TeamRadioMatchMode = 'at-or-before' | 'nearest';

export type TeamRadioEventContext = {
  captureTime: string;
  matchedTimingTime: string | null;
  matchMode: TeamRadioMatchMode;
  lap: number;
  position: number | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
  traffic: LapRecord['traffic'];
  trackStatus: LapRecord['trackStatus'];
  flags: LapRecord['flags'];
  stint: LapRecord['stint'];
};

export type TeamRadioEventRecord = TeamRadioCaptureSummary & {
  driverName: string | null;
  context: TeamRadioEventContext | null;
};

export type TeamRadioEventsResponse = {
  sessionPrefix: string | null;
  total: number;
  returned: number;
  captures: TeamRadioEventRecord[];
};

export type SessionLifecycleOrder = 'asc' | 'desc';

export type SessionLifecycleEventRecord = Pick<
  SessionLifecycleEvent,
  'eventId' | 'utc' | 'sessionStatus' | 'trackStatus' | 'source'
>;

export type SessionLifecycleResponse = {
  asOf: {
    source: SerializedResolvedCursor['source'];
    lap: number | null;
    dateTime: string | null;
    includeFuture: boolean;
  };
  sessionStatus: SessionLifecycleStatus | null;
  trackStatus: SessionLifecycleStatus | null;
  archiveStatus: SessionArchiveStatus | null;
  total: number;
  returned: number;
  order: SessionLifecycleOrder;
  events: SessionLifecycleEventRecord[];
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
  getTeamRadioEvents: (options?: {
    driverNumber?: string | number;
    limit?: number;
  }) => TeamRadioEventsResponse;
  getSessionLifecycle: (options?: {
    includeFuture?: boolean;
    limit?: number;
    order?: SessionLifecycleOrder;
  }) => SessionLifecycleResponse;
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

function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function getRawLatest(store: SessionStore, topic: string): RawPoint | null {
  const direct = store.topic(topic).latest as RawPoint | null;
  return direct ?? (store.topic(`${topic}.z`).latest as RawPoint | null);
}

function getNormalizedTopicTimeline(
  store: SessionStore,
  topic: string,
  options?: { from?: Date; to?: Date },
): RawPoint[] {
  let timeline = store.topic(topic).timeline(options?.from, options?.to);
  if (!timeline.length && !topic.endsWith('.z')) {
    timeline = store.topic(`${topic}.z`).timeline(options?.from, options?.to);
  }
  return timeline.map((point) => normalizePoint(point));
}

function getSubscribeTopicSnapshot(store: SessionStore, topic: string): unknown {
  const subscribe = isPlainObject(store.raw.subscribe)
    ? store.raw.subscribe
    : null;
  return subscribe?.[topic] ?? null;
}

function serializeSessionLifecycleEvent(
  event: SessionLifecycleEvent,
): SessionLifecycleEventRecord {
  return {
    eventId: event.eventId,
    utc: event.utc,
    sessionStatus: event.sessionStatus,
    trackStatus: event.trackStatus,
    source: event.source,
  };
}

function getDriverName(
  service: TimingService,
  driverNumber: string,
): string | null {
  return service.processors.driverList?.getName?.(driverNumber) ?? null;
}

function getTeamRadioCaptureList(
  store: SessionStore,
  service: TimingService,
  options: {
    staticPrefix?: string | null;
    driverNumber?: string | number;
  } = {},
): TeamRadioCaptureSummary[] {
  const processor = service.processors.teamRadio as
    | {
        getCaptures?: (query?: {
          staticPrefix?: string | null;
          driverNumber?: string | number;
          limit?: number;
        }) => TeamRadioCaptureSummary[];
        state?: unknown;
      }
    | undefined;

  if (processor?.getCaptures) {
    return processor.getCaptures(options) ?? [];
  }

  const captures = getTeamRadioCaptures(
    processor?.state ?? store.topic('TeamRadio').latest?.json,
    {
      staticPrefix: options.staticPrefix,
    },
  );

  if (options.driverNumber === undefined) {
    return captures;
  }

  const requestedDriver = String(options.driverNumber);
  return captures.filter((capture) => capture.driverNumber === requestedDriver);
}

function findLapRecordForDriverAt(
  analysisIndex: ReturnType<typeof buildAnalysisIndex>,
  driverNumber: string | null,
  captureTime: Date | null,
): { record: LapRecord; matchMode: TeamRadioMatchMode } | null {
  if (!driverNumber || !captureTime) {
    return null;
  }

  const records = analysisIndex.byDriver.get(driverNumber) ?? [];
  if (records.length === 0) {
    return null;
  }

  let atOrBefore: LapRecord | null = null;
  let nearest: LapRecord | null = null;
  let nearestDiff = Infinity;

  for (const record of records) {
    if (!record.dateTime) {
      continue;
    }

    const diff = Math.abs(record.dateTime.getTime() - captureTime.getTime());
    if (diff < nearestDiff) {
      nearest = record;
      nearestDiff = diff;
    }

    if (record.dateTime.getTime() <= captureTime.getTime()) {
      atOrBefore = record;
    }
  }

  if (atOrBefore) {
    return { record: atOrBefore, matchMode: 'at-or-before' };
  }
  if (nearest) {
    return { record: nearest, matchMode: 'nearest' };
  }
  return null;
}

function buildTeamRadioContext(
  analysisIndex: ReturnType<typeof buildAnalysisIndex>,
  capture: Pick<TeamRadioCaptureSummary, 'utc' | 'driverNumber'>,
): TeamRadioEventContext | null {
  const captureTime = parseIsoDate(capture.utc);
  const match = findLapRecordForDriverAt(
    analysisIndex,
    capture.driverNumber,
    captureTime,
  );
  if (!captureTime || !match) {
    return null;
  }

  const { record, matchMode } = match;
  return {
    captureTime: captureTime.toISOString(),
    matchedTimingTime: record.dateTime?.toISOString() ?? null,
    matchMode,
    lap: record.lap,
    position: record.position,
    gapToLeaderSec: record.gapToLeaderSec,
    intervalToAheadSec: record.intervalToAheadSec,
    traffic: record.traffic,
    trackStatus: serializeValue(record.trackStatus) as LapRecord['trackStatus'],
    flags: serializeValue(record.flags) as LapRecord['flags'],
    stint: serializeValue(record.stint) as LapRecord['stint'],
  };
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

function getTimingSnapshotPosition(snapshot: unknown) {
  if (!isPlainObject(snapshot)) {
    return Infinity;
  }

  return Number(snapshot.Position ?? snapshot.Line ?? Infinity);
}

function sortTimingSnapshots(entries: Array<[string, unknown]>) {
  return [...entries].sort(([leftNumber, left], [rightNumber, right]) => {
    const leftPosition = getTimingSnapshotPosition(left);
    const rightPosition = getTimingSnapshotPosition(right);
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

  const getTeamRadioEvents: OperatorApi['getTeamRadioEvents'] = (
    options = {},
  ) => {
    const sessionPrefix = getSessionStaticPrefix(store);
    const captures = getTeamRadioCaptureList(store, service, {
      staticPrefix: sessionPrefix,
      driverNumber: options.driverNumber,
    });
    const analysisIndex = buildAnalysisIndex({
      processors: service.processors,
    });
    const limited =
      typeof options.limit === 'number' && options.limit >= 0
        ? captures.slice(0, options.limit)
        : captures;

    return {
      sessionPrefix,
      total: captures.length,
      returned: limited.length,
      captures: limited.map((capture) => ({
        ...capture,
        driverName: capture.driverNumber
          ? getDriverName(service, capture.driverNumber)
          : null,
        context: buildTeamRadioContext(analysisIndex, capture),
      })),
    };
  };

  const getSessionLifecycle: OperatorApi['getSessionLifecycle'] = (
    options = {},
  ) => {
    const analysisIndex = buildAnalysisIndex({
      processors: service.processors,
    });
    const resolved = analysisIndex.resolveAsOf(currentCursor);
    const to = options.includeFuture ? undefined : (resolved.dateTime ?? undefined);
    const fallbackDateTime = resolved.dateTime ?? new Date(0);

    const sessionDataBase = normalizePoint({
      type: 'SessionData',
      json: getSubscribeTopicSnapshot(store, 'SessionData') ?? {},
      dateTime: fallbackDateTime,
    }).json;

    const sessionDataState = buildSessionDataState({
      baseState: sessionDataBase,
      timeline: getNormalizedTopicTimeline(store, 'SessionData', { to }),
    });

    const sessionStatusState =
      getNormalizedTopicTimeline(store, 'SessionStatus', { to }).at(-1)?.json ??
      getSubscribeTopicSnapshot(store, 'SessionStatus') ??
      null;

    const archiveStatusState =
      getNormalizedTopicTimeline(store, 'ArchiveStatus', { to }).at(-1)?.json ??
      getSubscribeTopicSnapshot(store, 'ArchiveStatus') ??
      null;

    const sessionInfoState =
      service.processors.sessionInfo?.state ??
      normalizePoint({
        type: 'SessionInfo',
        json: getSubscribeTopicSnapshot(store, 'SessionInfo') ?? {},
        dateTime: fallbackDateTime,
      }).json;

    const snapshot = buildSessionLifecycleSnapshot({
      sessionDataState,
      sessionStatusState,
      archiveStatusState,
      sessionInfoState,
    });

    let events = snapshot.events;
    const order = options.order ?? 'asc';
    if (order === 'desc') {
      events = [...events].reverse();
    }
    if (typeof options.limit === 'number' && options.limit >= 0) {
      events = events.slice(0, options.limit);
    }

    return {
      asOf: {
        source: resolved.source,
        lap: resolved.lap,
        dateTime: resolved.dateTime?.toISOString() ?? null,
        includeFuture: Boolean(options.includeFuture),
      },
      sessionStatus: snapshot.sessionStatus
        ? (serializeValue(snapshot.sessionStatus) as SessionLifecycleStatus)
        : null,
      trackStatus: snapshot.trackStatus
        ? (serializeValue(snapshot.trackStatus) as SessionLifecycleStatus)
        : null,
      archiveStatus: snapshot.archiveStatus
        ? (serializeValue(snapshot.archiveStatus) as SessionArchiveStatus)
        : null,
      total: snapshot.events.length,
      returned: events.length,
      order,
      events: events.map(serializeSessionLifecycleEvent),
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
    getTeamRadioEvents,
    getSessionLifecycle,
    getControlState,
    applyControl,
  };
}
