import { tool } from 'ai';
import { z } from 'zod';
import type { SessionStore } from '../core/session-store.js';
import type { RawPoint } from '../core/processors/types.js';
import { normalizePoint } from '../core/processors/normalize.js';
import { runPy } from './run-py.js';
import { isPlainObject } from '../core/processors/merge.js';
import { createPythonClient } from './pyodide/client.js';
import { buildPythonContext } from './pyodide/context.js';
import { getPyodideBaseDir, getPyodideIndexUrl } from './pyodide/paths.js';
import {
  decodeCarChannels,
  extractLapTimeMs,
  isPitLap,
  trackStatusIsGreen,
} from '../core/analysis-utils.js';
import { createAnalysisContext } from '../core/analysis.js';
import { buildAnalysisIndex } from '../core/analysis-index.js';
import { getHeartbeatSnapshot } from '../core/heartbeat.js';
import { shapeOf, shapeOfMany } from '../core/inspect.js';
import { getLapCountSnapshot } from '../core/lap-count.js';
import { getWeatherSnapshot } from '../core/weather-data.js';
import {
  classifyDrsChannel45,
  computeGapTrainsForLap,
  computePitLaneTimeStats,
  computeScVscDeltas,
} from '../core/race-engineer-metrics.js';
import {
  downloadTeamRadioCapture,
  playTeamRadioCapture,
  getSessionStaticPrefix,
  getTeamRadioCaptures,
  type TeamRadioExecFileImpl,
  TEAM_RADIO_PLAYERS,
  TEAM_RADIO_TRANSCRIPTION_BACKENDS,
  transcribeTeamRadioCapture,
} from '../core/team-radio.js';
import {
  getTeamRadioOpenAIAuthRequestConfig,
  type ResolvedOpenAIAuth,
} from '../core/openai-auth.js';
import {
  getCurrentTyreRecords,
  getTyreStintRecords,
} from '../core/tyre-state.js';
import { getPitStopEventRecords } from '../core/pit-stop-state.js';
import {
  getWeatherSeriesRecords,
  summarizeWeatherSeries,
} from '../core/weather-series.js';
import { getStreamMetadataRecords } from '../core/stream-metadata.js';
import { getLapSeriesRecords, summarizeLapSeries } from '../core/lap-series.js';
import {
  buildDriverTrackerState,
  getDriverTrackerMeta,
  getDriverTrackerRows,
} from '../core/driver-tracker.js';
import {
  buildDriverRaceInfoState,
  getDriverRaceInfoRows,
} from '../core/driver-race-info.js';
import {
  getOvertakeSeriesRecords,
  summarizeOvertakeSeries,
  type OvertakeSeriesRecord,
} from '../core/overtake-series.js';
import {
  getTimingStatsDriver,
  getTimingStatsTrapTable,
  getTimingStatsTrapTables,
} from '../core/timing-stats.js';
import {
  buildChampionshipPredictionState,
  getChampionshipPredictionDrivers,
  getChampionshipPredictionTeams,
} from '../core/championship-prediction.js';
import {
  decodePositionEntry,
  getCarDataCars,
  getLatestCarDataEntry,
  getLatestPositionBatch,
  getPositionEntries,
} from '../core/feed-models.js';
import {
  buildPositionSnapshotFromTimelines,
  getPositionSnapshot,
} from '../core/position-snapshot.js';
import {
  getSessionInfoCircuitGeometryData,
  getSessionInfoSummary,
} from '../core/session-info.js';
import {
  getRaceControlEvents,
  type RaceControlEvent,
} from '../core/processors/race-control-messages.js';
import { createOperatorApi } from '../core/operator-api.js';
import {
  buildSessionDataState,
  buildSessionLifecycleSnapshot,
} from '../core/session-lifecycle.js';
import {
  getTlaRcmRecords,
  summarizeTlaRcmRecords,
  TLA_RCM_CATEGORIES,
  type TlaRcmRecord,
} from '../core/tla-rcm.js';
import type { TimeCursor } from '../core/time-cursor.js';
import { getDataBookIndex, getDataBookTopic } from './data-book/data-book.js';
import type { LapRecord } from '../core/analysis-index.js';

const MAX_PYTHON_VARS_BYTES = 8 * 1024;
const ASYNCIO_RUN_PATTERNS = [
  /\basyncio\.run\s*\(/,
  /\brun_until_complete\s*\(/,
];
const MICROPIP_PATTERNS = [/\bmicropip\.install\s*\(/];

function assertPythonCodeAllowed(code: string) {
  for (const pattern of ASYNCIO_RUN_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(
        "asyncio.run() and loop.run_until_complete() are not supported in this Pyodide Node runtime. Use top-level 'await' in run_py and await call_tool(...) instead.",
      );
    }
  }
  for (const pattern of MICROPIP_PATTERNS) {
    if (pattern.test(code)) {
      throw new Error(
        'micropip.install(...) is disabled in this environment. Use only allowlisted packages shipped with the runtime (e.g. numpy).',
      );
    }
  }
}

function classifyPythonFailure(message: string): string | undefined {
  if (/no module named ['"]numpy['"]/i.test(message)) {
    return "Importing numpy should succeed (it's bundled). If it failed, retry once; the runtime will auto-load it.";
  }
  if (/asyncio\.run|run_until_complete|stack switching/i.test(message)) {
    return "Don't use asyncio.run() or run_until_complete(). Use top-level `await` and `await call_tool(...)` in run_py.";
  }
  if (/micropip\.install/i.test(message)) {
    return 'Runtime installs are disabled. Use only allowlisted packages bundled with the runtime (e.g. numpy).';
  }
  if (/DataCloneError|could not be cloned|structured clone/i.test(message)) {
    return 'Return JSON-serializable values only (dict/list/str/number/bool/None). Convert NumPy arrays to lists (e.g. arr.tolist()).';
  }
  if (/vars payload too large/i.test(message)) {
    return 'Use call_tool(...) inside Python for data. vars is only for tiny constants (<= 8KB).';
  }
  if (/AttributeError:\s*get\b/i.test(message)) {
    return "If you're calling .get(...), ensure the value is a dict. call_tool(...) returns Python dict/list; for lap tables use: tbl = await call_tool('get_lap_table', ...); rows = tbl.get('rows', []).";
  }
  return undefined;
}

function estimateJsonBytes(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return null;
  }
}

export function makeTools({
  store,
  processors,
  timeCursor,
  onTimeCursorChange,
  logger,
  resolveOpenAIAuth,
  resolveOpenAIApiKey,
  teamRadioExecFileImpl,
}: {
  store: SessionStore;
  processors: {
    heartbeat?: { state?: unknown | null };
    driverList?: {
      latest?: unknown | null;
      state?: Record<string, unknown> | null;
      getName?: (driverNumber: string) => string | null;
    };
    timingData?: {
      state?: unknown | null;
      bestLaps?: Map<string, unknown>;
      driversByLap?: Map<number, Map<string, unknown>>;
      getLapHistory?: (
        driverNumber: string,
      ) => Array<{ lap: number; snapshot: unknown }>;
      getLapSnapshot?: (driverNumber: string, lap: number) => unknown | null;
      getBestLapSnapshot?: (driverNumber: string) => unknown | null;
      getLapNumbers?: () => number[];
    };
    timingAppData?: { state?: unknown | null };
    timingStats?: { state?: unknown | null };
    trackStatus?: {
      state?: unknown | null;
      history?: Array<{
        at: Date;
        value: unknown;
        status: string | null;
        message: string | null;
      }>;
      getAt?: (dateTime: Date) => unknown | null;
    };
    lapCount?: { state?: unknown | null };
    weatherData?: { state?: unknown | null };
    sessionInfo?: { state?: unknown | null };
    sessionData?: { state?: unknown | null };
    extrapolatedClock?: {
      state?: unknown | null;
      getAt?: (dateTime?: Date | null) => unknown | null;
      getRemainingAt?: (dateTime?: Date | null) => {
        state: unknown | null;
        sourceTime: Date | null;
        referenceTime: Date | null;
        remainingMs: number | null;
        remainingSeconds: number | null;
        extrapolating: boolean;
        expired: boolean | null;
      };
    };
    topThree?: { state?: unknown | null };
    raceControlMessages?: {
      state?: unknown | null;
      getMessages?: (query?: {
        before?: Date | string | null;
        category?: string;
        flag?: string;
        scope?: string;
        driverNumber?: string | number;
        search?: string;
        limit?: number;
      }) => RaceControlEvent[];
    };
    teamRadio?: {
      state?: unknown | null;
      getCaptures?: (query?: {
        staticPrefix?: string | null;
        driverNumber?: string | number;
        limit?: number;
      }) => ReturnType<typeof getTeamRadioCaptures>;
      getCaptureCount?: () => number;
    };
    championshipPrediction?: { state?: unknown | null };
    driverTracker?: {
      state?: unknown | null;
      getRows?: (opts?: {
        driverListState?: Record<string, unknown> | null;
        driverNumber?: string | number;
      }) => unknown[];
    };
    driverRaceInfo?: {
      state?: unknown | null;
      getRows?: (opts?: {
        driverListState?: Record<string, unknown> | null;
        driverNumber?: string | number;
      }) => unknown[];
    };
    pitStopSeries?: { state?: unknown | null };
    pitStop?: { state?: unknown | null };
    pitLaneTimeCollection?: { state?: unknown | null };
    carData?: { state?: unknown | null };
    position?: { state?: unknown | null };
    extraTopics?: Record<
      string,
      { state?: unknown | null; latest?: unknown | null }
    >;
  };
  timeCursor: TimeCursor;
  onTimeCursorChange: (cursor: TimeCursor) => void;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
  resolveOpenAIAuth?: () => Promise<ResolvedOpenAIAuth | null>;
  resolveOpenAIApiKey?: () => Promise<string | null>;
  teamRadioExecFileImpl?: TeamRadioExecFileImpl;
}) {
  const getRawLatest = (topic: string) => {
    const direct = store.topic(topic).latest as RawPoint | null;
    return direct ?? (store.topic(`${topic}.z`).latest as RawPoint | null);
  };

  const getTopicState = (topic: string): unknown | null => {
    switch (topic) {
      case 'SessionInfo':
        return processors.sessionInfo?.state ?? null;
      case 'Heartbeat':
        return processors.heartbeat?.state ?? null;
      case 'DriverList':
        return processors.driverList?.state ?? null;
      case 'TimingData':
        return processors.timingData?.state ?? null;
      case 'TimingAppData':
        return processors.timingAppData?.state ?? null;
      case 'TimingStats':
        return processors.timingStats?.state ?? null;
      case 'TrackStatus':
        return processors.trackStatus?.state ?? null;
      case 'LapCount':
        return processors.lapCount?.state ?? null;
      case 'WeatherData':
        return processors.weatherData?.state ?? null;
      case 'SessionData':
        return processors.sessionData?.state ?? null;
      case 'ExtrapolatedClock':
        return processors.extrapolatedClock?.state ?? null;
      case 'TopThree':
        return processors.topThree?.state ?? null;
      case 'DriverTracker':
        return processors.driverTracker?.state ?? null;
      case 'RaceControlMessages':
        return processors.raceControlMessages?.state ?? null;
      case 'TeamRadio':
        return processors.teamRadio?.state ?? null;
      case 'ChampionshipPrediction':
        return processors.championshipPrediction?.state ?? null;
      case 'DriverRaceInfo':
        return processors.driverRaceInfo?.state ?? null;
      case 'PitStopSeries':
        return processors.pitStopSeries?.state ?? null;
      case 'PitStop':
        return processors.pitStop?.state ?? null;
      case 'PitLaneTimeCollection':
        return processors.pitLaneTimeCollection?.state ?? null;
      case 'CarData':
        return processors.carData?.state ?? null;
      case 'Position':
        return processors.position?.state ?? null;
      default:
        return processors.extraTopics?.[topic]?.state ?? null;
    }
  };

  const getNormalizedLatest = (topic: string) => {
    const canonicalTopic = canonicalizeTopicName(topic);
    const mergedState = getTopicState(canonicalTopic);
    const fallback = getRawLatest(canonicalTopic);
    if (mergedState !== null) {
      return {
        type: canonicalTopic,
        json: structuredClone(mergedState),
        dateTime: fallback?.dateTime ?? null,
      };
    }
    if (!fallback) return null;
    return normalizePoint(fallback);
  };
  const getDriverName = (driverNumber: string) =>
    processors.driverList?.getName?.(driverNumber) ?? null;

  const getTeamRadioCaptureList = (
    options: {
      staticPrefix?: string | null;
      driverNumber?: string | number;
      limit?: number;
    } = {},
  ) => {
    const processor = processors.teamRadio as
      | {
          getCaptures?: (query?: {
            staticPrefix?: string | null;
            driverNumber?: string | number;
            limit?: number;
          }) => ReturnType<typeof getTeamRadioCaptures>;
          state?: unknown;
        }
      | undefined;

    if (processor?.getCaptures) {
      return processor.getCaptures(options) ?? [];
    }

    const captures = getTeamRadioCaptures(processor?.state, {
      staticPrefix: options.staticPrefix,
    });
    const filtered =
      options.driverNumber === undefined
        ? captures
        : captures.filter(
            (capture) => capture.driverNumber === String(options.driverNumber),
          );

    return typeof options.limit === 'number'
      ? filtered.slice(0, options.limit)
      : filtered;
  };

  const getTeamRadioCaptureCount = () => {
    const processor = processors.teamRadio as
      | { getCaptureCount?: () => number; state?: unknown }
      | undefined;
    if (processor?.getCaptureCount) {
      return processor.getCaptureCount();
    }

    return getTeamRadioCaptures(processor?.state).length;
  };

  const analysis = createAnalysisContext({ store, processors });
  const analysisIndex = buildAnalysisIndex({ processors });
  let currentCursor: TimeCursor = { ...timeCursor };
  const createReplayApi = () =>
    createOperatorApi({
      store,
      service: { processors } as any,
      timeCursor: currentCursor,
      onTimeCursorChange: (cursor) => {
        currentCursor = { ...cursor };
        onTimeCursorChange(currentCursor);
      },
    });
  let toolsByName: Record<string, any> = {};
  const toolHandler = async (name: string, args: unknown) => {
    if (name === 'run_py') {
      throw new Error('run_py is not callable from Python');
    }
    const target = toolsByName[name];
    if (!target) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const parsedArgs =
      typeof target.inputSchema?.parse === 'function'
        ? target.inputSchema.parse(args)
        : args;
    if (typeof target.execute !== 'function') {
      throw new Error(`Tool is missing execute(): ${name}`);
    }
    return target.execute(parsedArgs);
  };
  const pythonClient = createPythonClient({ toolHandler, logger });
  const pyodideIndexUrl = getPyodideIndexUrl();
  const pyodideCacheDir = getPyodideBaseDir();

  const resolveCurrentCursor = () => analysisIndex.resolveAsOf(currentCursor);

  const getHistoricalTyreAsOfLap = () => {
    const resolved = resolveCurrentCursor();
    const latestLap = analysisIndex.lapNumbers.at(-1) ?? null;
    if (
      typeof resolved.lap !== 'number' ||
      typeof latestLap !== 'number' ||
      resolved.lap >= latestLap
    ) {
      return null;
    }
    return resolved.lap;
  };

  const getTimingDataStateAsOfLap = (asOfLap: number | null) => {
    if (typeof asOfLap !== 'number') {
      return processors.timingData?.state;
    }
    const lapDrivers = processors.timingData?.driversByLap?.get(asOfLap);
    if (!lapDrivers) {
      return processors.timingData?.state;
    }

    const lines: Record<string, unknown> = {};
    for (const [driverNumber, snapshot] of lapDrivers.entries()) {
      lines[driverNumber] = snapshot;
    }
    return { Lines: lines };
  };

  const serializeRaceControlEvent = (event: RaceControlEvent) => ({
    ...event,
    dateTime: event.dateTime ? event.dateTime.toISOString() : null,
  });

  const serializeTlaRcmRecord = (record: TlaRcmRecord) => ({
    ...record,
    dateTime: record.dateTime ? record.dateTime.toISOString() : null,
    driverName: record.driverNumber ? getDriverName(record.driverNumber) : null,
  });

  const getOvertakeSeriesContext = (record: OvertakeSeriesRecord) => {
    const match = findLapRecordForDriverAt(
      record.driverNumber,
      record.dateTime,
    );
    if (!record.dateTime || !match) {
      return null;
    }

    const { record: lapRecord, matchMode } = match;
    return {
      eventTime: record.dateTime.toISOString(),
      matchedTimingTime: lapRecord.dateTime
        ? lapRecord.dateTime.toISOString()
        : null,
      matchMode,
      lap: lapRecord.lap,
      position: lapRecord.position,
      trackStatus: lapRecord.trackStatus,
    };
  };

  const serializeOvertakeSeriesRecord = (record: OvertakeSeriesRecord) => ({
    ...record,
    driverName: getDriverName(record.driverNumber),
    dateTime: record.dateTime ? record.dateTime.toISOString() : null,
    timingContext: getOvertakeSeriesContext(record),
  });

  const sortTimingSnapshots = (
    entries: Array<[string, unknown]>,
  ): Array<[string, unknown]> =>
    [...entries].sort(([leftNumber, left], [rightNumber, right]) => {
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

  const serializeBestLapRecord = (
    driverNumber: string,
    value: unknown,
    options: { includeSnapshot?: boolean } = {},
  ) => {
    if (!isPlainObject(value)) {
      return null;
    }
    const time =
      typeof value.time === 'string' && value.time.trim().length > 0
        ? value.time
        : null;
    const timeMs =
      typeof value.timeMs === 'number' && Number.isFinite(value.timeMs)
        ? value.timeMs
        : null;
    const lap =
      typeof value.lap === 'number' && Number.isFinite(value.lap)
        ? value.lap
        : null;
    if (!time || timeMs === null) {
      return null;
    }

    const record: Record<string, unknown> = {
      driverNumber,
      driverName: getDriverName(driverNumber),
      time,
      timeMs,
      lap,
    };

    if (options.includeSnapshot) {
      record.snapshot = (value as any).snapshot ?? null;
    }

    return record;
  };

  const listRaceControlEvents = (
    opts: {
      includeFuture?: boolean;
      category?: string;
      flag?: string;
      scope?: string;
      driverNumber?: string | number;
      search?: string;
      limit?: number;
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const query = {
      before: opts.includeFuture ? null : resolved.dateTime,
      category: opts.category,
      flag: opts.flag,
      scope: opts.scope,
      driverNumber: opts.driverNumber,
      search: opts.search,
      limit: opts.limit,
    };
    const getter = processors.raceControlMessages?.getMessages;
    const events = getter
      ? getter(query)
      : getRaceControlEvents(processors.raceControlMessages?.state, query);
    return { resolved, events };
  };

  const listDriverRaceInfo = (
    opts: {
      driverNumber?: string | number;
      includeFuture?: boolean;
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const subscribeState = normalizePoint({
      type: 'DriverRaceInfo',
      json: (store.raw.subscribe as any)?.DriverRaceInfo ?? {},
      dateTime: resolved.dateTime ?? new Date(0),
    }).json;
    const timeline = analysis.getTopicTimeline('DriverRaceInfo', {
      to: opts.includeFuture ? undefined : (resolved.dateTime ?? undefined),
    });
    const state = buildDriverRaceInfoState({
      baseState: subscribeState,
      timeline,
    });

    const rows = getDriverRaceInfoRows({
      state,
      driverListState: processors.driverList?.state ?? null,
      driverNumber: opts.driverNumber,
    });

    return {
      resolved,
      rows,
    };
  };

  const listDriverTracker = (
    opts: {
      driverNumber?: string | number;
      includeFuture?: boolean;
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const subscribeState = normalizePoint({
      type: 'DriverTracker',
      json: (store.raw.subscribe as any)?.DriverTracker ?? {},
      dateTime: resolved.dateTime ?? new Date(0),
    }).json;
    const timeline = analysis.getTopicTimeline('DriverTracker', {
      to: opts.includeFuture ? undefined : (resolved.dateTime ?? undefined),
    });

    let state = buildDriverTrackerState({
      baseState: subscribeState,
      timeline,
    });
    let rows = getDriverTrackerRows({
      state,
      driverListState: processors.driverList?.state ?? null,
      driverNumber: opts.driverNumber,
    });

    if (!rows.length && processors.driverTracker?.state) {
      state = (processors.driverTracker.state ?? null) as typeof state;
      rows = getDriverTrackerRows({
        state,
        driverListState: processors.driverList?.state ?? null,
        driverNumber: opts.driverNumber,
      });
    }

    const enrichedRows = rows.map((row) => ({
      ...row,
      driverName:
        row.driverNumber === null
          ? row.driverName
          : (row.driverName ?? getDriverName(row.driverNumber)),
    }));

    return {
      resolved,
      state,
      meta: getDriverTrackerMeta(state),
      rows: enrichedRows,
    };
  };

  const getDefaultEndLap = () => {
    const resolved = resolveCurrentCursor();
    return typeof resolved.lap === 'number' ? resolved.lap : undefined;
  };

  const getLatestCarEntry = () => {
    return getLatestCarDataEntry(processors.carData?.state ?? null);
  };

  const getProjectedClock = (referenceTime?: Date | null) => {
    const projected =
      processors.extrapolatedClock?.getRemainingAt?.(referenceTime);
    if (projected) {
      return projected;
    }
    const state = processors.extrapolatedClock?.state ?? null;
    return {
      state,
      sourceTime: null,
      referenceTime: referenceTime ?? null,
      remainingMs: null,
      remainingSeconds: null,
      extrapolating: Boolean((state as any)?.Extrapolating),
      expired: null,
    };
  };

  const getCurrentTyresView = (driverNumber?: string | number) => {
    const asOfLap = getHistoricalTyreAsOfLap();
    return getCurrentTyreRecords({
      currentTyresState: processors.extraTopics?.CurrentTyres?.state,
      tyreStintSeriesState: processors.extraTopics?.TyreStintSeries?.state,
      timingAppDataState: processors.timingAppData?.state,
      timingDataState: getTimingDataStateAsOfLap(asOfLap),
      driverNumber,
      asOfLap: asOfLap ?? undefined,
    }).map((record) => ({
      ...record,
      driverName: getDriverName(record.driverNumber),
    }));
  };

  const getTyreStintsView = (driverNumber?: string | number) => {
    const asOfLap = getHistoricalTyreAsOfLap();
    return getTyreStintRecords({
      tyreStintSeriesState: processors.extraTopics?.TyreStintSeries?.state,
      timingAppDataState: processors.timingAppData?.state,
      timingDataState: getTimingDataStateAsOfLap(asOfLap),
      driverNumber,
      asOfLap: asOfLap ?? undefined,
    }).map((record) => ({
      ...record,
      driverName: getDriverName(record.driverNumber),
    }));
  };

  const getPositionSnapshotView = (driverNumber?: string | number) => {
    const resolved = resolveCurrentCursor();
    const latestLap = analysisIndex.lapNumbers.at(-1) ?? null;
    const replayCutoff =
      resolved.source === 'time'
        ? (() => {
            if (!currentCursor.iso) {
              return null;
            }
            const parsed = new Date(currentCursor.iso);
            return Number.isFinite(parsed.getTime()) ? parsed : null;
          })()
        : Boolean(resolved.dateTime) &&
            typeof resolved.lap === 'number' &&
            typeof latestLap === 'number' &&
            resolved.lap < latestLap
          ? resolved.dateTime
          : null;

    if (!replayCutoff) {
      return getPositionSnapshot({
        positionState: processors.position?.state,
        carDataState: processors.carData?.state,
        driverListState: processors.driverList?.state ?? null,
        timingDataState: processors.timingData?.state,
        driverNumber,
      });
    }

    return buildPositionSnapshotFromTimelines({
      positionTimeline: analysis.getTopicTimeline('Position', {
        to: replayCutoff,
      }),
      carDataTimeline: analysis.getTopicTimeline('CarData', {
        to: replayCutoff,
      }),
      timingDataTimeline:
        resolved.source === 'time'
          ? [
              ...analysis.getTopicTimeline('TimingData', {
                to: replayCutoff,
              }),
              ...analysis.getTopicTimeline('TimingDataF1', {
                to: replayCutoff,
              }),
            ].sort(
              (left, right) =>
                left.dateTime.getTime() - right.dateTime.getTime(),
            )
          : undefined,
      driverListState: processors.driverList?.state ?? null,
      timingDataState:
        resolved.source === 'time'
          ? undefined
          : getTimingDataStateAsOfLap(resolved.lap),
      driverNumber,
    });
  };

  const serializeLapSeriesRecord = (
    record: ReturnType<typeof getLapSeriesRecords>[number],
  ) => ({
    ...record,
    driverName: getDriverName(record.driverNumber),
  });

  const listLapSeries = (
    opts: {
      driverNumber?: string | number;
      startLap?: number;
      endLap?: number;
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const requestedEndLap =
      typeof opts.endLap === 'number' ? opts.endLap : undefined;
    const effectiveEndLap =
      !opts.includeFuture && typeof resolved.lap === 'number'
        ? Math.min(requestedEndLap ?? resolved.lap, resolved.lap)
        : requestedEndLap;

    const allRecords = getLapSeriesRecords({
      lapSeriesState: processors.extraTopics?.LapSeries?.state,
      driverNumber: opts.driverNumber,
      startLap: opts.startLap,
      endLap: effectiveEndLap,
    });

    let records = allRecords;
    if (opts.order === 'desc') {
      records = [...records].reverse();
    }
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      records = records.slice(0, Math.floor(opts.limit));
    }

    return {
      resolved,
      total: allRecords.length,
      allRecords,
      records,
    };
  };

  const listOvertakeSeries = (
    opts: {
      driverNumber?: string | number;
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    let allRecords = getOvertakeSeriesRecords({
      overtakeSeriesState: processors.extraTopics?.OvertakeSeries?.state,
      driverNumber: opts.driverNumber,
    });

    if (!opts.includeFuture && resolved.dateTime) {
      const cutoffMs = resolved.dateTime.getTime();
      allRecords = allRecords.filter((record) => {
        const recordMs = record.dateTime?.getTime();
        return (
          recordMs === undefined || recordMs === null || recordMs <= cutoffMs
        );
      });
    }

    let records = allRecords;
    if (opts.order === 'desc') {
      records = [...records].reverse();
    }
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      records = records.slice(0, Math.floor(opts.limit));
    }

    return {
      resolved,
      total: allRecords.length,
      allRecords,
      records,
    };
  };

  const serializePitStopEvent = (
    event: ReturnType<typeof getPitStopEventRecords>[number],
  ) => ({
    ...event,
    driverName: getDriverName(event.driverNumber),
    dateTime: event.dateTime ? event.dateTime.toISOString() : null,
  });

  const listPitStopEvents = (
    opts: {
      driverNumber?: string | number;
      startLap?: number;
      endLap?: number;
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    let events = getPitStopEventRecords({
      pitStopSeriesState: processors.pitStopSeries?.state,
      tyreStintSeriesState: processors.extraTopics?.TyreStintSeries?.state,
      timingAppDataState: processors.timingAppData?.state,
      timingDataState: processors.timingData?.state,
      driverNumber: opts.driverNumber,
      startLap: opts.startLap,
      endLap: opts.endLap,
    });

    if (!opts.includeFuture) {
      events = events.filter((event) => {
        if (resolved.source === 'time' && event.dateTime && resolved.dateTime) {
          return event.dateTime.getTime() <= resolved.dateTime.getTime();
        }
        if (event.lap !== null && resolved.lap !== null) {
          return event.lap <= resolved.lap;
        }
        if (event.dateTime && resolved.dateTime) {
          return event.dateTime.getTime() <= resolved.dateTime.getTime();
        }
        return true;
      });
    }

    if (opts.order === 'desc') {
      events = [...events].reverse();
    }

    if (typeof opts.limit === 'number' && opts.limit > 0) {
      events = events.slice(0, Math.floor(opts.limit));
    }

    return { resolved, events };
  };

  const listChampionshipPrediction = (
    opts: {
      driverNumber?: string | number;
      teamName?: string;
      includeFuture?: boolean;
      limit?: number;
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const subscribeState = normalizePoint({
      type: 'ChampionshipPrediction',
      json: (store.raw.subscribe as any)?.ChampionshipPrediction ?? {},
      dateTime: resolved.dateTime ?? new Date(0),
    }).json;
    const timeline = analysis.getTopicTimeline('ChampionshipPrediction', {
      to: opts.includeFuture ? undefined : (resolved.dateTime ?? undefined),
    });

    let state = buildChampionshipPredictionState({
      baseState: subscribeState,
      timeline,
    });

    let allDrivers = getChampionshipPredictionDrivers({
      state,
      driverListState: processors.driverList?.state ?? null,
    });
    let allTeams = getChampionshipPredictionTeams({ state });

    if (
      allDrivers.length === 0 &&
      allTeams.length === 0 &&
      processors.championshipPrediction?.state
    ) {
      state = (processors.championshipPrediction.state ?? null) as typeof state;
      allDrivers = getChampionshipPredictionDrivers({
        state,
        driverListState: processors.driverList?.state ?? null,
      });
      allTeams = getChampionshipPredictionTeams({ state });
    }

    return {
      resolved,
      totalDrivers: allDrivers.length,
      totalTeams: allTeams.length,
      drivers: getChampionshipPredictionDrivers({
        state,
        driverListState: processors.driverList?.state ?? null,
        driverNumber: opts.driverNumber,
        teamName: opts.teamName,
        limit: opts.limit,
      }),
      teams: getChampionshipPredictionTeams({
        state,
        teamName: opts.teamName,
        limit: opts.limit,
      }),
    };
  };

  const listWeatherSeries = (
    opts: {
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const latestWeather = getNormalizedLatest('WeatherData');
    let samples = getWeatherSeriesRecords({
      weatherDataSeriesState: processors.extraTopics?.WeatherDataSeries?.state,
      weatherDataState: processors.weatherData?.state,
      weatherDataTimestamp: latestWeather?.dateTime ?? null,
    });

    if (!opts.includeFuture && resolved.dateTime) {
      const cutoffMs = resolved.dateTime.getTime();
      samples = samples.filter((sample) => {
        if (!sample.timestamp) {
          return true;
        }
        const sampleMs = Date.parse(sample.timestamp);
        return Number.isFinite(sampleMs) ? sampleMs <= cutoffMs : true;
      });
    }

    const order = opts.order ?? 'asc';
    if (order === 'desc') {
      samples = [...samples].reverse();
    }
    if (typeof opts.limit === 'number') {
      samples = samples.slice(0, opts.limit);
    }

    return {
      resolved,
      samples,
      summary: summarizeWeatherSeries(samples),
      total: getWeatherSeriesRecords({
        weatherDataSeriesState:
          processors.extraTopics?.WeatherDataSeries?.state,
        weatherDataState: processors.weatherData?.state,
        weatherDataTimestamp: latestWeather?.dateTime ?? null,
      }).length,
    };
  };

  const listStreamMetadata = (
    topic: 'AudioStreams' | 'ContentStreams',
    opts: {
      language?: string;
      search?: string;
      limit?: number;
    } = {},
  ) => {
    const staticPrefix = getSessionStaticPrefix(store);
    const allStreams = getStreamMetadataRecords({
      topic,
      state: getNormalizedLatest(topic)?.json ?? null,
      staticPrefix,
      language: opts.language,
      search: opts.search,
    });
    const streams =
      typeof opts.limit === 'number'
        ? allStreams.slice(0, opts.limit)
        : allStreams;

    return {
      sessionPrefix: staticPrefix,
      total: allStreams.length,
      returned: streams.length,
      languages: Array.from(
        new Set(
          allStreams
            .map((stream) => stream.language)
            .filter((language): language is string => Boolean(language)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
      types: Array.from(
        new Set(
          allStreams
            .map((stream) => stream.type)
            .filter((type): type is string => Boolean(type)),
        ),
      ).sort((left, right) => left.localeCompare(right)),
      streams,
    };
  };

  const serializeSessionLifecycleEvent = (event: {
    eventId: string;
    utc: string | null;
    sessionStatus: string | null;
    trackStatus: string | null;
    source: 'SessionData' | 'SessionStatus' | 'SessionInfo';
  }) => ({
    eventId: event.eventId,
    utc: event.utc,
    sessionStatus: event.sessionStatus,
    trackStatus: event.trackStatus,
    source: event.source,
  });

  const listSessionLifecycle = (
    opts: {
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const to = opts.includeFuture
      ? undefined
      : (resolved.dateTime ?? undefined);
    const fallbackDateTime = resolved.dateTime ?? new Date(0);

    const sessionDataBase = normalizePoint({
      type: 'SessionData',
      json: (store.raw.subscribe as any)?.SessionData ?? {},
      dateTime: fallbackDateTime,
    }).json;

    const sessionDataState = buildSessionDataState({
      baseState: sessionDataBase,
      timeline: analysis.getTopicTimeline('SessionData', { to }),
    });

    const sessionStatusState =
      analysis.getTopicTimeline('SessionStatus', { to }).at(-1)?.json ??
      (store.raw.subscribe as any)?.SessionStatus ??
      null;

    const archiveStatusState =
      analysis.getTopicTimeline('ArchiveStatus', { to }).at(-1)?.json ??
      (store.raw.subscribe as any)?.ArchiveStatus ??
      null;

    const sessionInfoState =
      processors.sessionInfo?.state ??
      normalizePoint({
        type: 'SessionInfo',
        json: (store.raw.subscribe as any)?.SessionInfo ?? {},
        dateTime: fallbackDateTime,
      }).json;

    const snapshot = buildSessionLifecycleSnapshot({
      sessionDataState,
      sessionStatusState,
      archiveStatusState,
      sessionInfoState,
    });

    let events = snapshot.events;
    const order = opts.order ?? 'asc';
    if (order === 'desc') {
      events = [...events].reverse();
    }
    if (typeof opts.limit === 'number' && opts.limit > 0) {
      events = events.slice(0, opts.limit);
    }

    return {
      resolved,
      total: snapshot.events.length,
      sessionStatus: snapshot.sessionStatus,
      trackStatus: snapshot.trackStatus,
      archiveStatus: snapshot.archiveStatus,
      events,
    };
  };

  const listTlaRcmEvents = (
    opts: {
      category?: string;
      driverNumber?: string | number;
      search?: string;
      includeFuture?: boolean;
      limit?: number;
      order?: 'asc' | 'desc';
    } = {},
  ) => {
    const resolved = resolveCurrentCursor();
    const to = opts.includeFuture
      ? undefined
      : (resolved.dateTime ?? undefined);

    let events = getTlaRcmRecords({
      tlaRcmState:
        processors.extraTopics?.TlaRcm?.state ??
        getNormalizedLatest('TlaRcm')?.json ??
        null,
      timeline: analysis.getTopicTimeline('TlaRcm', { to }),
    });

    const categoryFilter =
      typeof opts.category === 'string'
        ? opts.category.trim().toLowerCase()
        : '';
    const driverFilter =
      opts.driverNumber === undefined ? null : String(opts.driverNumber);
    const searchFilter =
      typeof opts.search === 'string' ? opts.search.trim().toLowerCase() : '';

    if (categoryFilter) {
      events = events.filter(
        (event) => event.category.toLowerCase() === categoryFilter,
      );
    }
    if (driverFilter !== null) {
      events = events.filter((event) => event.driverNumber === driverFilter);
    }
    if (searchFilter) {
      events = events.filter((event) =>
        [event.message, event.timestamp, event.driverNumber]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(searchFilter)),
      );
    }

    const order = opts.order ?? 'desc';
    if (order === 'desc') {
      events = [...events].reverse();
    }

    const total = events.length;
    const summary = summarizeTlaRcmRecords(events);

    if (typeof opts.limit === 'number' && opts.limit > 0) {
      events = events.slice(0, opts.limit);
    }

    return {
      resolved,
      total,
      summary,
      order,
      events,
    };
  };

  const canonicalizeTopicName = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.endsWith('.z')) return trimmed.slice(0, -2);
    return trimmed;
  };

  const pickKnownKeys = (value: unknown, keys: string[]) => {
    if (!isPlainObject(value)) return null;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in (value as any)) out[key] = (value as any)[key];
    }
    return out;
  };

  const getStructuredSessionInfoState = (value: unknown) => {
    const summary = getSessionInfoSummary(value);
    const geometryData = getSessionInfoCircuitGeometryData(value);
    if (!summary) {
      return null;
    }

    return {
      sessionInfo:
        pickKnownKeys(summary, [
          'Key',
          'Name',
          'Type',
          'Path',
          'StaticPrefix',
          'StartDate',
          'EndDate',
          'GmtOffset',
          'ScheduledStartUtc',
          'IsRace',
          'IsQualifying',
          'IsSprint',
          'Meeting',
        ]) ?? summary,
      circuitGeometry: {
        pointCount: summary.CircuitGeometry.pointCount,
        cornerCount: summary.CircuitGeometry.cornerCount,
        rotation: summary.CircuitGeometry.rotation,
        hasGeometry: summary.CircuitGeometry.hasGeometry,
        sampleCorners: summary.CircuitGeometry.sampleCorners,
      },
      circuitGeometryData: geometryData
        ? {
            points: geometryData.points,
            corners: geometryData.corners,
            rotation: geometryData.rotation,
            hasGeometry: geometryData.hasGeometry,
          }
        : null,
    };
  };

  const pickLastIndexedValues = (value: unknown, limit: number) => {
    if (!isPlainObject(value)) return null;
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(-limit)) {
      out[key] = (value as any)[key];
    }
    return out;
  };

  const parseIsoDate = (value: unknown) => {
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  };

  const findLapRecordForDriverAt = (
    driverNumber: string | null,
    captureTime: Date | null,
  ): { record: LapRecord; matchMode: 'at-or-before' | 'nearest' } | null => {
    if (!driverNumber || !captureTime) {
      return null;
    }

    const records = analysisIndex.byDriver.get(driverNumber) ?? [];
    if (!records.length) {
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
  };

  const getTeamRadioCaptureContext = (capture: {
    utc: string | null;
    driverNumber: string | null;
  }) => {
    const captureTime = parseIsoDate(capture.utc);
    const match = findLapRecordForDriverAt(capture.driverNumber, captureTime);
    if (!captureTime || !match) {
      return null;
    }

    const { record, matchMode } = match;
    return {
      captureTime: captureTime.toISOString(),
      matchedTimingTime: record.dateTime ? record.dateTime.toISOString() : null,
      matchMode,
      lap: record.lap,
      position: record.position,
      gapToLeaderSec: record.gapToLeaderSec,
      intervalToAheadSec: record.intervalToAheadSec,
      traffic: record.traffic,
      trackStatus: record.trackStatus,
      flags: record.flags,
      stint: record.stint,
    };
  };

  const pickTimingLine = (snapshot: unknown) => {
    if (!isPlainObject(snapshot)) return null;
    const allowed = [
      'Line',
      'Position',
      'NumberOfLaps',
      'GapToLeader',
      'IntervalToPositionAhead',
      'LastLapTime',
      'BestLapTime',
      'Sectors',
      'Speeds',
      'InPit',
      'PitOut',
      'PitIn',
      'IsPitLap',
      'Retired',
      'Stopped',
      'Status',
      'KnockedOut',
      'SessionPart',
    ];
    const out: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in (snapshot as any)) out[key] = (snapshot as any)[key];
    }
    return out;
  };

  const resolveExampleDriverNumber = (explicit?: string | number) => {
    if (explicit !== undefined) return String(explicit);
    const lines = (processors.timingData?.state as any)?.Lines;
    if (isPlainObject(lines)) {
      let best: { num: string; pos: number } | null = null;
      for (const [num, line] of Object.entries(lines)) {
        const rawPos = (line as any)?.Line ?? (line as any)?.Position ?? 999;
        const pos = Number(rawPos);
        const normalized = Number.isFinite(pos) ? pos : 999;
        if (!best || normalized < best.pos) best = { num, pos: normalized };
      }
      if (best) return best.num;
      const firstKey = Object.keys(lines)[0];
      if (firstKey) return firstKey;
    }
    return null;
  };

  const buildTopicExample = (
    canonicalTopic: string,
    driverNumber?: string | number,
  ) => {
    const topic = canonicalizeTopicName(canonicalTopic);
    const resolvedDriver = resolveExampleDriverNumber(driverNumber);
    const resolved = resolveCurrentCursor();
    const asOf = {
      source: resolved.source,
      lap: resolved.lap,
      dateTime: resolved.dateTime,
    };

    if (topic === 'TimingData') {
      const state = processors.timingData?.state as any;
      const lines = state?.Lines;
      if (!isPlainObject(lines)) return null;
      let leader: string | null = null;
      let leaderPos = 999;
      for (const [num, line] of Object.entries(lines)) {
        const raw = (line as any)?.Line ?? (line as any)?.Position ?? 999;
        const pos = Number(raw);
        const normalized = Number.isFinite(pos) ? pos : 999;
        if (normalized < leaderPos) {
          leaderPos = normalized;
          leader = num;
        }
      }
      const leaderSnap = leader ? lines[leader] : null;
      const driver =
        resolvedDriver && resolvedDriver in lines ? resolvedDriver : leader;
      const driverSnap = driver ? lines[driver] : null;
      return {
        asOf,
        leader: leader
          ? {
              driverNumber: leader,
              driverName: getDriverName(leader),
              snapshot: pickTimingLine(leaderSnap),
            }
          : null,
        driver: driver
          ? {
              driverNumber: driver,
              driverName: getDriverName(driver),
              snapshot: pickTimingLine(driverSnap),
            }
          : null,
      };
    }

    if (topic === 'TrackStatus') {
      const current = processors.trackStatus?.state ?? null;
      const history = processors.trackStatus?.history ?? [];
      return {
        asOf,
        current: current
          ? (pickKnownKeys(current, ['Status', 'Message']) ?? current)
          : null,
        recent: history.slice(-6).map((entry) => ({
          at: entry.at,
          status: entry.status,
          message: entry.message,
        })),
      };
    }

    if (topic === 'RaceControlMessages') {
      const recent = listRaceControlEvents({ limit: 8 }).events.map(
        serializeRaceControlEvent,
      );
      return {
        asOf,
        count: listRaceControlEvents().events.length,
        recent,
      };
    }

    if (topic === 'DriverTracker') {
      const { meta, rows } = listDriverTracker({
        driverNumber: resolvedDriver ?? undefined,
      });
      if (!rows.length && meta.withheld === null && meta.sessionPart === null) {
        return null;
      }
      if (resolvedDriver) {
        return {
          asOf,
          withheld: meta.withheld,
          sessionPart: meta.sessionPart,
          row: rows[0] ?? null,
        };
      }
      return {
        asOf,
        withheld: meta.withheld,
        sessionPart: meta.sessionPart,
        total: rows.length,
        rows: rows.slice(0, 8),
      };
    }

    if (topic === 'DriverRaceInfo') {
      const { rows } = listDriverRaceInfo({
        driverNumber: resolvedDriver ?? undefined,
      });
      if (!rows.length) return null;
      if (resolvedDriver) {
        return {
          asOf,
          driver: rows[0],
        };
      }
      return {
        asOf,
        total: rows.length,
        rows: rows.slice(0, 8),
      };
    }

    if (topic === 'OvertakeSeries') {
      const { total, allRecords, records } = listOvertakeSeries({
        driverNumber: resolvedDriver ?? undefined,
        limit: 5,
      });
      if (!total) {
        return null;
      }

      if (resolvedDriver) {
        return {
          asOf,
          driverNumber: resolvedDriver,
          driverName: getDriverName(resolvedDriver),
          summary: summarizeOvertakeSeries(allRecords),
          records: records.map(serializeOvertakeSeriesRecord),
        };
      }

      const grouped = new Map<string, typeof allRecords>();
      for (const record of allRecords) {
        const entries = grouped.get(record.driverNumber) ?? [];
        entries.push(record);
        grouped.set(record.driverNumber, entries);
      }

      return {
        asOf,
        totalRecords: total,
        totalDrivers: grouped.size,
        drivers: Array.from(grouped.entries())
          .map(([driverNumber, entries]) => ({
            driverNumber,
            driverName: getDriverName(driverNumber),
            summary: summarizeOvertakeSeries(entries),
          }))
          .slice(0, 8),
        records: records.map(serializeOvertakeSeriesRecord),
      };
    }

    if (topic === 'TeamRadio') {
      const recent = getTeamRadioCaptureList({ limit: 5 });
      return {
        asOf,
        count: getTeamRadioCaptureCount(),
        recent,
      };
    }

    if (topic === 'CarData') {
      const entry = getLatestCarEntry();
      if (!entry) return null;
      const cars = getCarDataCars(entry);
      if (resolvedDriver && resolvedDriver in cars) {
        const car = cars[resolvedDriver];
        const channels = car?.Channels ?? null;
        return {
          asOf,
          utc: (entry as any)?.Utc ?? null,
          driverNumber: resolvedDriver,
          driverName: getDriverName(resolvedDriver),
          channels: decodeCarChannels(channels),
        };
      }
      const first = Object.keys(cars)[0];
      if (!first)
        return { asOf, utc: (entry as any)?.Utc ?? null, sample: null };
      const car = cars[first];
      return {
        asOf,
        utc: (entry as any)?.Utc ?? null,
        driverNumber: first,
        driverName: getDriverName(first),
        channels: decodeCarChannels(car?.Channels ?? null),
      };
    }

    if (topic === 'Position') {
      const latest = getLatestPositionBatch(processors.position?.state ?? null);
      if (!latest) return null;
      const entries = getPositionEntries(latest);
      const key =
        resolvedDriver && resolvedDriver in entries
          ? resolvedDriver
          : Object.keys(entries)[0];
      const sample = key ? entries[key] : null;
      return {
        asOf,
        timestamp: latest?.Timestamp ?? null,
        driverNumber: key ?? null,
        driverName: key ? getDriverName(key) : null,
        entry: sample ? (decodePositionEntry(sample) ?? sample) : null,
      };
    }

    if (topic === 'TimingAppData') {
      const state = processors.timingAppData?.state as any;
      const lines = state?.Lines ?? {};
      if (!isPlainObject(lines)) return null;
      const key =
        resolvedDriver && resolvedDriver in lines
          ? resolvedDriver
          : Object.keys(lines)[0];
      if (!key) return null;
      const line = lines[key];
      return {
        asOf,
        driverNumber: key,
        driverName: getDriverName(key),
        gridPos: (line as any)?.GridPos ?? null,
        stints: (line as any)?.Stints ?? null,
      };
    }

    if (topic === 'CurrentTyres') {
      const tyres = getCurrentTyresView(resolvedDriver ?? undefined);
      if (!tyres.length) return null;
      if (resolvedDriver) {
        return { asOf, tyre: tyres[0] };
      }
      return {
        asOf,
        totalDrivers: tyres.length,
        tyres: tyres.slice(0, 8),
      };
    }

    if (topic === 'TyreStintSeries') {
      const stints = getTyreStintsView(resolvedDriver ?? undefined);
      if (!stints.length) return null;
      if (resolvedDriver) {
        return {
          asOf,
          driverNumber: resolvedDriver,
          driverName: getDriverName(resolvedDriver),
          total: stints.length,
          stints,
        };
      }
      return {
        asOf,
        total: stints.length,
        stints: stints.slice(0, 8),
      };
    }

    if (topic === 'LapSeries') {
      const { allRecords, records } = listLapSeries({
        driverNumber: resolvedDriver ?? undefined,
        limit: resolvedDriver ? 12 : 24,
      });
      if (!allRecords.length) return null;

      if (resolvedDriver) {
        return {
          asOf,
          driverNumber: resolvedDriver,
          driverName: getDriverName(resolvedDriver),
          summary: summarizeLapSeries(allRecords),
          records: records.map(serializeLapSeriesRecord),
        };
      }

      const grouped = new Map<string, typeof allRecords>();
      for (const record of allRecords) {
        const entries = grouped.get(record.driverNumber) ?? [];
        entries.push(record);
        grouped.set(record.driverNumber, entries);
      }

      return {
        asOf,
        totalDrivers: grouped.size,
        drivers: Array.from(grouped.entries()).map(
          ([driverNumber, entries]) => ({
            driverNumber,
            driverName: getDriverName(driverNumber),
            summary: summarizeLapSeries(entries),
          }),
        ),
        sampleRecords: records.slice(0, 12).map(serializeLapSeriesRecord),
      };
    }

    if (topic === 'Heartbeat') {
      const state = processors.heartbeat?.state ?? null;
      if (!state) return null;
      return {
        asOf,
        heartbeat: getHeartbeatSnapshot(state) ?? state,
      };
    }

    if (topic === 'WeatherData') {
      const state = processors.weatherData?.state ?? null;
      if (!state) return null;
      return { asOf, weather: getWeatherSnapshot(state) ?? state };
    }

    if (topic === 'ExtrapolatedClock') {
      const projected = getProjectedClock(asOf.dateTime);
      if (!projected.state) return null;
      return {
        asOf: {
          ...asOf,
          dateTime: projected.referenceTime ?? asOf.dateTime,
        },
        clock:
          pickKnownKeys(projected.state, [
            'Utc',
            'Remaining',
            'Extrapolating',
          ]) ?? projected.state,
        projectedRemainingMs: projected.remainingMs,
        projectedRemainingSeconds: projected.remainingSeconds,
        extrapolating: projected.extrapolating,
        expired: projected.expired,
      };
    }

    if (topic === 'SessionInfo') {
      const state = processors.sessionInfo?.state as any;
      if (!state) return null;
      const summary = getStructuredSessionInfoState(state);
      if (!summary) return null;
      return { asOf, ...summary };
    }

    if (topic === 'SessionData') {
      const lifecycle = listSessionLifecycle({ limit: 8 });
      const state = processors.sessionData?.state ?? null;
      if (!state && !lifecycle.total) return null;
      return {
        asOf,
        sessionStatus: lifecycle.sessionStatus,
        trackStatus: lifecycle.trackStatus,
        archiveStatus: lifecycle.archiveStatus,
        recentEvents: lifecycle.events.map(serializeSessionLifecycleEvent),
        sessionData:
          state === null
            ? null
            : (pickKnownKeys(state, ['Series', 'StatusSeries']) ?? state),
      };
    }

    if (topic === 'SessionStatus' || topic === 'ArchiveStatus') {
      const lifecycle = listSessionLifecycle({ limit: 8 });
      if (
        !lifecycle.sessionStatus &&
        !lifecycle.archiveStatus &&
        lifecycle.events.length === 0
      ) {
        return null;
      }

      return {
        asOf,
        sessionStatus: lifecycle.sessionStatus,
        trackStatus: lifecycle.trackStatus,
        archiveStatus: lifecycle.archiveStatus,
        recentEvents: lifecycle.events.map(serializeSessionLifecycleEvent),
      };
    }

    if (topic === 'TopThree') {
      const state = processors.topThree?.state as any;
      if (!state) return null;
      const lines = Array.isArray(state?.Lines)
        ? state.Lines.slice(0, 3)
        : (state?.Lines ?? null);
      return { asOf, withheld: state?.Withheld ?? null, lines };
    }

    if (topic === 'TimingStats') {
      const state = processors.timingStats?.state ?? null;
      if (!state) return null;

      if (resolvedDriver) {
        const driver = getTimingStatsDriver({
          state,
          driverListState: processors.driverList?.state,
          driverNumber: resolvedDriver,
        });
        if (!driver) {
          return null;
        }
        return {
          asOf,
          driverNumber: driver.driverNumber,
          driverName: driver.driverName,
          bestSpeeds: driver.bestSpeeds,
        };
      }

      const traps = getTimingStatsTrapTables({
        state,
        driverListState: processors.driverList?.state,
        limit: 3,
      });

      return {
        asOf,
        availableTraps: traps.map((table) => table.trap),
        traps,
      };
    }

    if (topic === 'LapCount') {
      const state = processors.lapCount?.state ?? null;
      if (!state) return null;
      return {
        asOf,
        lapCount:
          getLapCountSnapshot(state) ??
          pickKnownKeys(state, ['CurrentLap', 'TotalLaps']) ??
          state,
      };
    }

    if (topic === 'ChampionshipPrediction') {
      const state = processors.championshipPrediction?.state as any;
      if (!state) return null;
      const drivers = state?.Drivers;
      if (isPlainObject(drivers)) {
        const list = Object.values(drivers)
          .filter((x) => isPlainObject(x))
          .map((x) => x as any)
          .sort(
            (a, b) =>
              Number(a?.PredictedPosition ?? 999) -
              Number(b?.PredictedPosition ?? 999),
          )
          .slice(0, 6)
          .map(
            (d) =>
              pickKnownKeys(d, [
                'RacingNumber',
                'CurrentPosition',
                'PredictedPosition',
                'CurrentPoints',
                'PredictedPoints',
              ]) ?? d,
          );
        return { asOf, drivers: list };
      }
      return {
        asOf,
        keys: state
          ? Object.keys(state)
              .filter((k) => k !== '_kf')
              .slice(0, 10)
          : null,
      };
    }

    if (topic === 'PitLaneTimeCollection') {
      const state = processors.pitLaneTimeCollection?.state as any;
      if (!state) return null;
      const pitTimes = state?.PitTimes;
      if (!isPlainObject(pitTimes)) return { asOf, pitTimes: null };
      const key =
        resolvedDriver && resolvedDriver in pitTimes
          ? resolvedDriver
          : Object.keys(pitTimes)[0];
      const entry = key ? pitTimes[key] : null;
      return {
        asOf,
        driverNumber: key ?? null,
        driverName: key ? getDriverName(key) : null,
        pitTime: entry,
      };
    }

    if (topic === 'PitStopSeries') {
      const state = processors.pitStopSeries?.state as any;
      if (!state) return null;
      const pitTimes = state?.PitTimes;
      if (!isPlainObject(pitTimes)) return { asOf, pitTimes: null };
      const key =
        resolvedDriver && resolvedDriver in pitTimes
          ? resolvedDriver
          : Object.keys(pitTimes)[0];
      const driverStops = key ? pitTimes[key] : null;
      return {
        asOf,
        driverNumber: key ?? null,
        driverName: key ? getDriverName(key) : null,
        stops: pickLastIndexedValues(driverStops, 3) ?? driverStops,
      };
    }

    if (topic === 'PitStop') {
      const state = processors.pitStop?.state ?? null;
      if (!state) return null;
      return { asOf, pitStop: state };
    }

    // Fallback: show a small slice of the latest normalized point if available.
    const latest = getNormalizedLatest(topic);
    if (!latest) return null;
    const json = latest.json;
    if (!isPlainObject(json)) return { asOf, value: json };
    return {
      asOf,
      value:
        pickKnownKeys(
          json,
          Object.keys(json)
            .filter((k) => k !== '_kf')
            .slice(0, 12),
        ) ?? json,
    };
  };

  const tools = {
    get_latest: tool({
      description:
        'Get latest snapshot for a topic (normalized RawPoint; .z topics are decompressed)',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => getNormalizedLatest(topic),
    }),
    get_data_book_index: tool({
      description:
        'List known live timing topics with definitions and recommended tools. Use this to quickly orient to what data exists and what it means.',
      inputSchema: z.object({}),
      execute: async () => getDataBookIndex(),
    }),
    get_topic_reference: tool({
      description:
        'Get the DataBook reference for a topic (purpose, semantics, key fields, pitfalls) and an optional small session-backed example snippet.',
      inputSchema: z.object({
        topic: z.string(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        includeExample: z.boolean().optional(),
      }),
      execute: async ({ topic, driverNumber, includeExample }) => {
        const entry = getDataBookTopic(topic);
        const canonical = entry ? entry.topic : canonicalizeTopicName(topic);
        const example =
          includeExample === false
            ? null
            : buildTopicExample(canonical, driverNumber);

        // Determine whether we have data loaded for this topic.
        const presentByProcessor = getTopicState(canonical) !== null;

        const present =
          presentByProcessor ||
          getNormalizedLatest(canonical) !== null ||
          example !== null;

        return {
          requested: topic,
          canonicalTopic: canonical,
          found: Boolean(entry),
          present,
          reference: entry,
          example,
        };
      },
    }),
    get_download_manifest: tool({
      description:
        'Get the download manifest for this session (topics attempted, per-topic success/failure). Useful to prove coverage and explain missing topics.',
      inputSchema: z.object({}),
      execute: async () => (store.raw as any)?.download ?? null,
    }),
    get_keyframe: tool({
      description:
        'Get the downloaded keyframe JSON for a topic (snapshot from Index.json KeyFramePath). Useful when a stream is missing or to inspect the full snapshot shape.',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => {
        const keyframes = (store.raw as any)?.keyframes;
        if (!isPlainObject(keyframes)) return null;
        if (topic in keyframes) return (keyframes as any)[topic];
        if (!topic.endsWith('.z') && `${topic}.z` in keyframes) {
          return (keyframes as any)[`${topic}.z`];
        }
        return null;
      },
    }),
    get_driver_list: tool({
      description: 'Get latest DriverList',
      inputSchema: z.object({}),
      execute: async () => processors.driverList?.state ?? null,
    }),
    get_timing_state: tool({
      description: 'Get merged TimingData state (full Lines map)',
      inputSchema: z.object({}),
      execute: async () => processors.timingData?.state ?? null,
    }),
    get_lap_history: tool({
      description:
        'Get lap history snapshots for a driver. Useful for last N laps.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]),
        limit: z.number().optional(),
      }),
      execute: async ({ driverNumber, limit }) => {
        const num = String(driverNumber);
        const history = processors.timingData?.getLapHistory?.(num) ?? [];
        if (typeof limit === 'number') return history.slice(-limit);
        return history;
      },
    }),
    get_lap_snapshot: tool({
      description:
        'Get the merged TimingData snapshot for a specific lap. Useful for deterministic lap replay and cross-driver state checks.',
      inputSchema: z.object({
        lap: z.number().int().positive(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ lap, driverNumber }) => {
        if (driverNumber !== undefined) {
          const num = String(driverNumber);
          const snapshot =
            processors.timingData?.getLapSnapshot?.(num, lap) ??
            processors.timingData?.driversByLap?.get(lap)?.get(num) ??
            null;
          if (!snapshot) {
            return null;
          }
          return {
            lap,
            driverNumber: num,
            driverName: getDriverName(num),
            snapshot,
          };
        }

        const lapDrivers = processors.timingData?.driversByLap?.get(lap);
        if (!lapDrivers) {
          return null;
        }

        const drivers = sortTimingSnapshots(
          Array.from(lapDrivers.entries()),
        ).map(([num, snapshot]) => ({
          driverNumber: num,
          driverName: getDriverName(num),
          snapshot,
        }));

        return {
          lap,
          totalDrivers: drivers.length,
          drivers,
        };
      },
    }),
    get_best_laps: tool({
      description:
        'Get best-lap records from the TimingData processor, with optional best-lap snapshots for deterministic replay.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        limit: z.number().int().positive().max(100).optional(),
        includeSnapshot: z.boolean().optional(),
      }),
      execute: async ({ driverNumber, limit, includeSnapshot }) => {
        const requestedDriver =
          driverNumber === undefined ? undefined : String(driverNumber);

        if (requestedDriver !== undefined) {
          const direct =
            processors.timingData?.getBestLapSnapshot?.(requestedDriver) ??
            processors.timingData?.bestLaps?.get(requestedDriver) ??
            null;
          return serializeBestLapRecord(requestedDriver, direct, {
            includeSnapshot,
          });
        }

        const laps = Array.from(
          processors.timingData?.bestLaps?.entries() ?? [],
        )
          .map(([num, value]) =>
            serializeBestLapRecord(num, value, { includeSnapshot }),
          )
          .filter(
            (record): record is Record<string, unknown> => record !== null,
          )
          .sort((left, right) => {
            const leftMs = Number(left.timeMs ?? Infinity);
            const rightMs = Number(right.timeMs ?? Infinity);
            if (leftMs !== rightMs) {
              return leftMs - rightMs;
            }
            return String(left.driverNumber).localeCompare(
              String(right.driverNumber),
            );
          });

        const sliced = typeof limit === 'number' ? laps.slice(0, limit) : laps;

        return {
          total: laps.length,
          returned: sliced.length,
          bestLaps: sliced,
        };
      },
    }),
    get_timing_app_data: tool({
      description: 'Get merged TimingAppData state (stints, tyres)',
      inputSchema: z.object({}),
      execute: async () => processors.timingAppData?.state ?? null,
    }),
    get_current_tyres: tool({
      description:
        'Get deterministic current tyre state per driver as of the current analysis cursor. Prefers CurrentTyres at the latest cursor and falls back to TyreStintSeries/TimingAppData for historical replay.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ driverNumber }) => {
        const tyres = getCurrentTyresView(driverNumber);
        if (driverNumber !== undefined) {
          return tyres[0] ?? null;
        }
        return {
          totalDrivers: tyres.length,
          tyres,
        };
      },
    }),
    get_tyre_stints: tool({
      description:
        'Get per-driver tyre stint history in a deterministic shape as of the current analysis cursor. Prefers TyreStintSeries and falls back to TimingAppData when the newer feed is missing.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ driverNumber }) => {
        const stints = getTyreStintsView(driverNumber);
        if (driverNumber !== undefined) {
          return {
            driverNumber: String(driverNumber),
            driverName: getDriverName(String(driverNumber)),
            total: stints.length,
            stints,
          };
        }

        const grouped = new Map<string, typeof stints>();
        for (const stint of stints) {
          const entries = grouped.get(stint.driverNumber) ?? [];
          entries.push(stint);
          grouped.set(stint.driverNumber, entries);
        }

        return {
          totalDrivers: grouped.size,
          drivers: Array.from(grouped.entries()).map(([driver, records]) => ({
            driverNumber: driver,
            driverName: getDriverName(driver),
            stints: records,
          })),
        };
      },
    }),
    get_lap_series: tool({
      description:
        'Get deterministic lap-by-lap classified positions from LapSeries, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        startLap: z.number().int().positive().optional(),
        endLap: z.number().int().positive().optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({
        driverNumber,
        startLap,
        endLap,
        includeFuture,
        limit,
        order,
      }) => {
        const { resolved, allRecords, records, total } = listLapSeries({
          driverNumber,
          startLap,
          endLap,
          includeFuture,
          limit,
          order,
        });

        if (driverNumber !== undefined) {
          const normalizedDriver = String(driverNumber);
          return {
            asOf: {
              source: resolved.source,
              lap: resolved.lap,
              dateTime: resolved.dateTime,
              includeFuture: Boolean(includeFuture),
            },
            driverNumber: normalizedDriver,
            driverName: getDriverName(normalizedDriver),
            total,
            returned: records.length,
            order: order ?? 'asc',
            summary: summarizeLapSeries(allRecords),
            records: records.map(serializeLapSeriesRecord),
          };
        }

        const grouped = new Map<string, typeof allRecords>();
        for (const record of allRecords) {
          const entries = grouped.get(record.driverNumber) ?? [];
          entries.push(record);
          grouped.set(record.driverNumber, entries);
        }

        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          totalRecords: total,
          returnedRecords: records.length,
          totalDrivers: grouped.size,
          order: order ?? 'asc',
          drivers: Array.from(grouped.entries()).map(
            ([normalizedDriver, entries]) => ({
              driverNumber: normalizedDriver,
              driverName: getDriverName(normalizedDriver),
              summary: summarizeLapSeries(entries),
            }),
          ),
          records: records.map(serializeLapSeriesRecord),
        };
      },
    }),
    get_overtake_series: tool({
      description:
        'Get deterministic OvertakeSeries records, filtered to the current analysis cursor unless includeFuture is true. Exposes the raw feed count metric plus matched lap/position context when timing data is available.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({ driverNumber, includeFuture, limit, order }) => {
        const { resolved, allRecords, records, total } = listOvertakeSeries({
          driverNumber,
          includeFuture,
          limit,
          order,
        });

        if (driverNumber !== undefined) {
          const normalizedDriver = String(driverNumber);
          return {
            asOf: {
              source: resolved.source,
              lap: resolved.lap,
              dateTime: resolved.dateTime,
              includeFuture: Boolean(includeFuture),
            },
            driverNumber: normalizedDriver,
            driverName: getDriverName(normalizedDriver),
            total,
            returned: records.length,
            order: order ?? 'asc',
            summary: summarizeOvertakeSeries(allRecords),
            records: records.map(serializeOvertakeSeriesRecord),
          };
        }

        const grouped = new Map<string, typeof allRecords>();
        for (const record of allRecords) {
          const entries = grouped.get(record.driverNumber) ?? [];
          entries.push(record);
          grouped.set(record.driverNumber, entries);
        }

        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          totalRecords: total,
          returnedRecords: records.length,
          totalDrivers: grouped.size,
          order: order ?? 'asc',
          drivers: Array.from(grouped.entries()).map(
            ([normalizedDriver, entries]) => ({
              driverNumber: normalizedDriver,
              driverName: getDriverName(normalizedDriver),
              summary: summarizeOvertakeSeries(entries),
            }),
          ),
          records: records.map(serializeOvertakeSeriesRecord),
        };
      },
    }),
    get_timing_stats: tool({
      description:
        'Get deterministic TimingStats speed-trap rankings or per-driver best-speed records.',
      inputSchema: z.object({
        trap: z.string().optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ trap, driverNumber, limit }) => {
        const state = processors.timingStats?.state ?? null;
        if (!state) {
          return null;
        }

        if (driverNumber !== undefined) {
          return (
            getTimingStatsDriver({
              state,
              driverListState: processors.driverList?.state,
              driverNumber,
            }) ?? null
          );
        }

        if (trap) {
          return (
            getTimingStatsTrapTable({
              state,
              driverListState: processors.driverList?.state,
              trap,
              limit,
            }) ?? null
          );
        }

        const traps = getTimingStatsTrapTables({
          state,
          driverListState: processors.driverList?.state,
          limit,
        });

        return {
          totalDrivers: isPlainObject(
            (state as { Lines?: unknown } | null)?.Lines,
          )
            ? Object.keys((state as { Lines: Record<string, unknown> }).Lines)
                .length
            : 0,
          availableTraps: traps.map((table) => table.trap),
          traps,
        };
      },
    }),
    get_track_status: tool({
      description: 'Get merged TrackStatus',
      inputSchema: z.object({}),
      execute: async () => processors.trackStatus?.state ?? null,
    }),
    get_track_status_history: tool({
      description: 'Get TrackStatus change history (time, status, message)',
      inputSchema: z.object({}),
      execute: async () => processors.trackStatus?.history ?? [],
    }),
    get_lap_count: tool({
      description: 'Get merged LapCount',
      inputSchema: z.object({}),
      execute: async () => {
        const state = processors.lapCount?.state ?? null;
        return state ? (getLapCountSnapshot(state) ?? state) : null;
      },
    }),
    get_weather: tool({
      description: 'Get the latest typed WeatherData snapshot',
      inputSchema: z.object({}),
      execute: async () => {
        const state = processors.weatherData?.state ?? null;
        return state ? (getWeatherSnapshot(state) ?? state) : null;
      },
    }),
    get_weather_series: tool({
      description:
        'Get deterministic weather samples from WeatherDataSeries, filtered to the current analysis cursor unless includeFuture is true. Falls back to the latest WeatherData when the series feed is unavailable.',
      inputSchema: z.object({
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(500).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({ includeFuture, limit, order }) => {
        const { resolved, samples, summary, total } = listWeatherSeries({
          includeFuture,
          limit,
          order,
        });
        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          total,
          returned: samples.length,
          order: order ?? 'asc',
          summary,
          samples,
        };
      },
    }),
    get_content_streams: tool({
      description:
        'Get deterministic content/commentary stream metadata with resolved URLs for playback or inspection workflows.',
      inputSchema: z.object({
        language: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ language, search, limit }) =>
        listStreamMetadata('ContentStreams', {
          language,
          search,
          limit,
        }),
    }),
    get_audio_streams: tool({
      description:
        'Get deterministic audio stream metadata with resolved URLs for external playback and synchronization workflows.',
      inputSchema: z.object({
        language: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ language, search, limit }) =>
        listStreamMetadata('AudioStreams', {
          language,
          search,
          limit,
        }),
    }),
    get_session_info: tool({
      description:
        'Get deterministic SessionInfo with derived static prefix, scheduled UTC start, and session-type flags.',
      inputSchema: z.object({}),
      execute: async () =>
        getStructuredSessionInfoState(processors.sessionInfo?.state ?? null),
    }),
    get_session_data: tool({
      description: 'Get merged SessionData',
      inputSchema: z.object({}),
      execute: async () => processors.sessionData?.state ?? null,
    }),
    get_session_lifecycle: tool({
      description:
        'Get deterministic session lifecycle status and status-series events, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(200).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({ includeFuture, limit, order }) => {
        const result = listSessionLifecycle({ includeFuture, limit, order });
        return {
          asOf: {
            source: result.resolved.source,
            lap: result.resolved.lap,
            dateTime: result.resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          sessionStatus: result.sessionStatus,
          trackStatus: result.trackStatus,
          archiveStatus: result.archiveStatus,
          total: result.total,
          returned: result.events.length,
          order: order ?? 'asc',
          events: result.events.map(serializeSessionLifecycleEvent),
        };
      },
    }),
    get_extrapolated_clock: tool({
      description:
        'Get ExtrapolatedClock as of the current analysis cursor, including projected remaining time when the session clock is extrapolating.',
      inputSchema: z.object({}),
      execute: async () => {
        const resolved = resolveCurrentCursor();
        const projected = getProjectedClock(resolved.dateTime);
        if (!projected.state) return null;
        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: projected.referenceTime ?? resolved.dateTime,
          },
          clock:
            pickKnownKeys(projected.state, [
              'Utc',
              'Remaining',
              'Extrapolating',
            ]) ?? projected.state,
          sourceTime: projected.sourceTime,
          remainingMs: projected.remainingMs,
          remainingSeconds: projected.remainingSeconds,
          extrapolating: projected.extrapolating,
          expired: projected.expired,
        };
      },
    }),
    get_top_three: tool({
      description: 'Get merged TopThree',
      inputSchema: z.object({}),
      execute: async () => processors.topThree?.state ?? null,
    }),
    get_race_control_messages: tool({
      description: 'Get merged RaceControlMessages (Messages dict)',
      inputSchema: z.object({}),
      execute: async () => processors.raceControlMessages?.state ?? null,
    }),
    get_race_control_events: tool({
      description:
        'Get deterministic race control events newest-first, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        category: z.string().optional(),
        flag: z.string().optional(),
        scope: z.string().optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        search: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
        includeFuture: z.boolean().optional(),
      }),
      execute: async ({
        category,
        flag,
        scope,
        driverNumber,
        search,
        limit,
        includeFuture,
      }) => {
        const { resolved, events } = listRaceControlEvents({
          category,
          flag,
          scope,
          driverNumber,
          search,
          limit,
          includeFuture,
        });
        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          total: listRaceControlEvents({
            category,
            flag,
            scope,
            driverNumber,
            search,
            includeFuture,
          }).events.length,
          returned: events.length,
          events: events.map(serializeRaceControlEvent),
        };
      },
    }),
    get_tla_rcm_events: tool({
      description:
        'Get deterministic TlaRcm ticker events with typed message context, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        category: z.enum(TLA_RCM_CATEGORIES).optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        search: z.string().optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(200).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({
        category,
        driverNumber,
        search,
        includeFuture,
        limit,
        order,
      }) => {
        const result = listTlaRcmEvents({
          category,
          driverNumber,
          search,
          includeFuture,
          limit,
          order,
        });

        return {
          asOf: {
            source: result.resolved.source,
            lap: result.resolved.lap,
            dateTime: result.resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          total: result.total,
          returned: result.events.length,
          order: result.order,
          summary: result.summary,
          events: result.events.map(serializeTlaRcmRecord),
        };
      },
    }),
    get_driver_race_info: tool({
      description:
        'Get deterministic DriverRaceInfo rows, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        includeFuture: z.boolean().optional(),
      }),
      execute: async ({ driverNumber, includeFuture }) => {
        const { resolved, rows } = listDriverRaceInfo({
          driverNumber,
          includeFuture,
        });
        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
          },
          includeFuture: Boolean(includeFuture),
          total: rows.length,
          rows,
        };
      },
    }),
    get_driver_tracker: tool({
      description:
        'Get deterministic DriverTracker board rows, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(60).optional(),
      }),
      execute: async ({ driverNumber, includeFuture, limit }) => {
        const { resolved, meta, rows } = listDriverTracker({
          driverNumber,
          includeFuture,
        });
        const returned =
          driverNumber === undefined || limit === undefined
            ? rows
            : rows.slice(0, Math.floor(limit));

        if (driverNumber !== undefined) {
          const normalizedDriver = String(driverNumber);
          return {
            asOf: {
              source: resolved.source,
              lap: resolved.lap,
              dateTime: resolved.dateTime,
              includeFuture: Boolean(includeFuture),
            },
            withheld: meta.withheld,
            sessionPart: meta.sessionPart,
            driverNumber: normalizedDriver,
            driverName: getDriverName(normalizedDriver),
            total: rows.length,
            returned: returned.length,
            rows: returned,
            row: returned[0] ?? null,
          };
        }

        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          withheld: meta.withheld,
          sessionPart: meta.sessionPart,
          total: rows.length,
          returned: returned.length,
          rows: returned.slice(0, limit ?? rows.length),
        };
      },
    }),
    get_team_radio: tool({
      description: 'Get merged TeamRadio (Captures dict)',
      inputSchema: z.object({}),
      execute: async () => processors.teamRadio?.state ?? null,
    }),
    get_team_radio_events: tool({
      description:
        'List team radio captures newest-first with resolved static clip URLs and lap/track context when timing history is available. Useful for playback/download workflows and for correlating radio with track events.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
      execute: async ({ driverNumber, limit }) => {
        const staticPrefix = getSessionStaticPrefix(store);
        const captures = getTeamRadioCaptureList({
          staticPrefix,
          driverNumber,
        });
        const sliced = captures.slice(0, limit ?? 20).map((capture) => ({
          ...capture,
          driverName: capture.driverNumber
            ? getDriverName(capture.driverNumber)
            : null,
          context: getTeamRadioCaptureContext(capture),
        }));

        return {
          sessionPrefix: staticPrefix,
          total: captures.length,
          returned: sliced.length,
          captures: sliced,
        };
      },
    }),
    play_team_radio: tool({
      description:
        'Download a team radio clip if needed and launch local playback via the system opener or a specific player binary.',
      inputSchema: z.object({
        captureId: z.union([z.string(), z.number()]).optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        overwriteDownload: z.boolean().optional(),
        player: z.enum(TEAM_RADIO_PLAYERS).optional(),
      }),
      execute: async ({
        captureId,
        driverNumber,
        overwriteDownload,
        player,
      }) => {
        const playback = await playTeamRadioCapture({
          source: store,
          state: processors.teamRadio?.state,
          captureId,
          driverNumber,
          overwriteDownload,
          player,
        });

        return {
          ...playback,
          driverName: playback.driverNumber
            ? getDriverName(playback.driverNumber)
            : null,
        };
      },
    }),
    download_team_radio: tool({
      description:
        'Download a team radio clip to the local f1aire data directory. Useful when you want a stable local file path for playback or transcription workflows.',
      inputSchema: z.object({
        captureId: z.union([z.string(), z.number()]).optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        overwrite: z.boolean().optional(),
      }),
      execute: async ({ captureId, driverNumber, overwrite }) => {
        const download = await downloadTeamRadioCapture({
          source: store,
          state: processors.teamRadio?.state,
          captureId,
          driverNumber,
          overwrite,
        });

        return {
          ...download,
          driverName: download.driverNumber
            ? getDriverName(download.driverNumber)
            : null,
        };
      },
    }),
    transcribe_team_radio: tool({
      description:
        'Download and transcribe a team radio clip, caching both the audio file and transcript for later playback/analysis workflows.',
      inputSchema: z.object({
        captureId: z.union([z.string(), z.number()]).optional(),
        driverNumber: z.union([z.string(), z.number()]).optional(),
        backend: z.enum(TEAM_RADIO_TRANSCRIPTION_BACKENDS).optional(),
        model: z.string().optional(),
        forceTranscription: z.boolean().optional(),
        overwriteDownload: z.boolean().optional(),
      }),
      execute: async ({
        captureId,
        driverNumber,
        backend,
        model,
        forceTranscription,
        overwriteDownload,
      }) => {
        const auth = resolveOpenAIAuth ? await resolveOpenAIAuth() : null;
        const authConfig = auth
          ? getTeamRadioOpenAIAuthRequestConfig(auth)
          : {
              apiBase: undefined,
              bearerToken: resolveOpenAIApiKey
                ? await resolveOpenAIApiKey()
                : null,
              chatGptTranscription: false,
            };
        const result = await transcribeTeamRadioCapture({
          source: store,
          state: processors.teamRadio?.state,
          captureId,
          driverNumber,
          backend,
          model,
          forceTranscription,
          overwriteDownload,
          apiKey: authConfig.bearerToken,
          apiBase: authConfig.apiBase,
          chatGptAccountId: authConfig.chatGptAccountId,
          chatGptTranscription: authConfig.chatGptTranscription,
          execFileImpl: teamRadioExecFileImpl,
        });

        return {
          ...result,
          driverName: result.driverNumber
            ? getDriverName(result.driverNumber)
            : null,
        };
      },
    }),
    get_championship_prediction: tool({
      description:
        'Get deterministic championship prediction tables for drivers and teams, filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        teamName: z.string().optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async ({ driverNumber, teamName, includeFuture, limit }) => {
        const snapshot = listChampionshipPrediction({
          driverNumber,
          teamName,
          includeFuture,
          limit,
        });

        if (
          snapshot.totalDrivers === 0 &&
          snapshot.totalTeams === 0 &&
          snapshot.drivers.length === 0 &&
          snapshot.teams.length === 0
        ) {
          return null;
        }

        return {
          asOf: {
            source: snapshot.resolved.source,
            lap: snapshot.resolved.lap,
            dateTime: snapshot.resolved.dateTime,
            includeFuture: Boolean(includeFuture),
          },
          totalDrivers: snapshot.totalDrivers,
          totalTeams: snapshot.totalTeams,
          returnedDrivers: snapshot.drivers.length,
          returnedTeams: snapshot.teams.length,
          drivers: snapshot.drivers,
          teams: snapshot.teams,
        };
      },
    }),
    get_pit_stop_series: tool({
      description: 'Get merged PitStopSeries',
      inputSchema: z.object({}),
      execute: async () => processors.pitStopSeries?.state ?? null,
    }),
    get_pit_stop_events: tool({
      description:
        'Get deterministic pit stop events with lap, stationary/lane times, and tyre-before/tyre-after context. Filtered to the current analysis cursor unless includeFuture is true.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        startLap: z.number().int().positive().optional(),
        endLap: z.number().int().positive().optional(),
        includeFuture: z.boolean().optional(),
        limit: z.number().int().positive().max(200).optional(),
        order: z.enum(['asc', 'desc']).optional(),
      }),
      execute: async ({
        driverNumber,
        startLap,
        endLap,
        includeFuture,
        limit,
        order,
      }) => {
        const { resolved, events } = listPitStopEvents({
          driverNumber,
          startLap,
          endLap,
          includeFuture,
          limit,
          order,
        });

        const serialized = events.map(serializePitStopEvent);
        const driver = driverNumber === undefined ? null : String(driverNumber);

        if (driver) {
          return {
            asOf: {
              source: resolved.source,
              lap: resolved.lap,
              dateTime: resolved.dateTime
                ? resolved.dateTime.toISOString()
                : null,
            },
            driverNumber: driver,
            driverName: getDriverName(driver),
            total: serialized.length,
            events: serialized,
          };
        }

        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime: resolved.dateTime
              ? resolved.dateTime.toISOString()
              : null,
          },
          total: serialized.length,
          totalDrivers: new Set(events.map((event) => event.driverNumber)).size,
          events: serialized,
        };
      },
    }),
    get_pit_lane_times: tool({
      description: 'Get merged PitLaneTimeCollection',
      inputSchema: z.object({}),
      execute: async () => processors.pitLaneTimeCollection?.state ?? null,
    }),
    get_pit_stop: tool({
      description: 'Get merged PitStop',
      inputSchema: z.object({}),
      execute: async () => processors.pitStop?.state ?? null,
    }),
    get_car_data: tool({
      description: 'Get latest CarData entry',
      inputSchema: z.object({}),
      execute: async () => processors.carData?.state ?? null,
    }),
    get_car_telemetry: tool({
      description:
        'Get latest car telemetry channels (rpm/speed/gear/throttle/brake/drs). If driverNumber omitted, returns all drivers.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ driverNumber }) => {
        const entry = getLatestCarEntry();
        if (!entry) return null;
        const cars = getCarDataCars(entry);
        if (driverNumber !== undefined) {
          const num = String(driverNumber);
          const car = cars[num];
          const channels = car?.Channels ?? null;
          return {
            utc: (entry as any)?.Utc ?? null,
            driverNumber: num,
            channels: decodeCarChannels(channels),
          };
        }
        const all: Record<string, unknown> = {};
        for (const [num, car] of Object.entries(cars)) {
          const channels = car?.Channels ?? null;
          all[num] = decodeCarChannels(channels);
        }
        return { utc: (entry as any)?.Utc ?? null, drivers: all };
      },
    }),
    get_drs_state: tool({
      description:
        'Get latest per-driver DRS state from CarData channel 45. Returns a conservative classification (off/eligible/on/unknown).',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ driverNumber }) => {
        const entry = getLatestCarEntry();
        if (!entry) return null;
        const cars = getCarDataCars(entry);

        const classify = (channels: unknown) => {
          const drs = decodeCarChannels(channels)?.drs ?? null;
          return classifyDrsChannel45(drs);
        };

        const utc = (entry as any)?.Utc ?? null;
        const note =
          'CarData channel 45 is an encoded DRS integer. This tool uses a conservative mapping: 0/1=off, 8=eligible, 10/12/14=on; everything else=unknown.';

        if (driverNumber !== undefined) {
          const num = String(driverNumber);
          const car = cars[num];
          const channels = car?.Channels ?? null;
          const drs = classify(channels);
          return {
            utc,
            driverNumber: num,
            driverName: getDriverName(num),
            drs,
            note,
          };
        }

        const drivers: Record<string, unknown> = {};
        const counts: Record<string, number> = {
          off: 0,
          eligible: 0,
          on: 0,
          unknown: 0,
        };
        for (const [num, car] of Object.entries(cars)) {
          const channels = car?.Channels ?? null;
          const drs = classify(channels);
          counts[drs.state] = (counts[drs.state] ?? 0) + 1;
          drivers[num] = { driverName: getDriverName(num), drs };
        }
        return { utc, counts, drivers, note };
      },
    }),
    get_drs_usage: tool({
      description:
        'Summarize DRS state transitions for a driver by scanning CarData over a time/lap window. Uses CarData channel 45 conservative mapping.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        fromIso: z.string().optional(),
        toIso: z.string().optional(),
        limit: z.number().optional(),
        sampleEvery: z.number().optional(),
      }),
      execute: async ({
        driverNumber,
        startLap,
        endLap,
        fromIso,
        toIso,
        limit,
        sampleEvery,
      }) => {
        const driver = String(driverNumber);
        const resolved = resolveCurrentCursor();

        const parseDate = (value?: string) => {
          if (!value) return null;
          const dt = new Date(value);
          return Number.isFinite(dt.getTime()) ? dt : null;
        };

        const startDt =
          parseDate(fromIso) ??
          (typeof startLap === 'number'
            ? analysisIndex.resolveAsOf({ lap: startLap }).dateTime
            : null);
        const endDt =
          parseDate(toIso) ??
          (typeof endLap === 'number'
            ? analysisIndex.resolveAsOf({ lap: endLap }).dateTime
            : resolved.dateTime);

        const resolvedLimit =
          typeof limit === 'number' && limit > 0 ? Math.floor(limit) : 800;
        const resolvedSampleEvery =
          typeof sampleEvery === 'number' && sampleEvery > 1
            ? Math.floor(sampleEvery)
            : 1;

        const timeline = analysis.getTopicTimeline('CarData', {
          from: startDt ?? undefined,
          to: endDt ?? undefined,
          limit: resolvedLimit,
        });

        let prev: string | null = null;
        const transitions: Array<{
          utc: string | null;
          lap: number | null;
          raw: number | null;
          state: string;
        }> = [];
        const counts: Record<string, number> = {
          off: 0,
          eligible: 0,
          on: 0,
          unknown: 0,
        };
        let samples = 0;
        let last: {
          utc: string | null;
          raw: number | null;
          state: string;
        } | null = null;

        for (let i = 0; i < timeline.length; i += resolvedSampleEvery) {
          const point = timeline[i];
          const json = (point as any)?.json;
          const entries = Array.isArray(json?.Entries)
            ? (json.Entries as any[])
            : [];
          for (const entry of entries) {
            const cars = entry?.Cars ?? null;
            const car = cars && typeof cars === 'object' ? cars[driver] : null;
            const raw = car?.Channels?.['45'] ?? null;
            const drs = classifyDrsChannel45(raw);
            counts[drs.state] = (counts[drs.state] ?? 0) + 1;
            samples += 1;
            last = { utc: entry?.Utc ?? null, raw: drs.raw, state: drs.state };
            if (prev === drs.state) continue;
            prev = drs.state;
            const iso =
              entry?.Utc ?? (point as any)?.dateTime?.toISOString?.() ?? null;
            const lap =
              typeof iso === 'string'
                ? analysisIndex.resolveAsOf({ iso }).lap
                : null;
            transitions.push({ utc: iso, lap, raw: drs.raw, state: drs.state });
          }
        }

        return {
          driverNumber: driver,
          driverName: getDriverName(driver),
          fromIso: startDt?.toISOString?.() ?? null,
          toIso: endDt?.toISOString?.() ?? null,
          startLap: typeof startLap === 'number' ? startLap : null,
          endLap: typeof endLap === 'number' ? endLap : null,
          limit: resolvedLimit,
          sampleEvery: resolvedSampleEvery,
          samples,
          counts,
          transitions,
          last,
          note: 'CarData channel 45 codes are not formally documented. This tool uses a conservative mapping: 0/1=off, 8=eligible, 10/12/14=on; others=unknown.',
        };
      },
    }),
    get_lap_table: tool({
      description:
        'Get per-lap table derived from TimingData (lap time, sectors, gaps, stints, optional segments). Returns { rows }. Useful for any lap-based analysis.',
      inputSchema: z.object({
        driverNumbers: z.array(z.union([z.string(), z.number()])).optional(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        limit: z.number().optional(),
        includeTrackStatus: z.boolean().optional(),
        includeStints: z.boolean().optional(),
        includeGaps: z.boolean().optional(),
        includeSectors: z.boolean().optional(),
        includeSegments: z.boolean().optional(),
        includeSpeeds: z.boolean().optional(),
        includePitFlags: z.boolean().optional(),
        requireGreen: z.boolean().optional(),
      }),
      execute: async (opts) => {
        const defaultEndLap = getDefaultEndLap();
        const rows = analysis.getLapTable({
          ...opts,
          endLap: typeof opts.endLap === 'number' ? opts.endLap : defaultEndLap,
        });
        return { rows };
      },
    }),
    get_drs_trains: tool({
      description:
        'Detect DRS-style gap trains from TimingData (cars within thresholdSec of the car ahead). Uses per-lap IntervalToPositionAhead as an approximation.',
      inputSchema: z.object({
        lap: z.number().optional(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        thresholdSec: z.number().optional(),
        minCars: z.number().optional(),
        requireGreen: z.boolean().optional(),
      }),
      execute: async ({
        lap,
        startLap,
        endLap,
        thresholdSec,
        minCars,
        requireGreen,
      }) => {
        const defaultEndLap =
          getDefaultEndLap() ?? analysisIndex.lapNumbers.at(-1);
        const resolvedThreshold =
          typeof thresholdSec === 'number' && thresholdSec > 0
            ? thresholdSec
            : 1.0;
        const resolvedMinCars =
          typeof minCars === 'number' && minCars >= 2 ? Math.floor(minCars) : 3;
        const resolvedRequireGreen = requireGreen !== false;

        const lapList: number[] = [];
        if (typeof lap === 'number') {
          lapList.push(lap);
        } else {
          const resolvedEnd =
            typeof endLap === 'number' ? endLap : defaultEndLap;
          if (typeof resolvedEnd === 'number') {
            const resolvedStart =
              typeof startLap === 'number' ? startLap : resolvedEnd;
            const from = Math.min(resolvedStart, resolvedEnd);
            const to = Math.max(resolvedStart, resolvedEnd);
            for (let current = from; current <= to; current += 1)
              lapList.push(current);
          }
        }

        const laps = lapList.map((lapValue) => {
          const lapRecords = analysisIndex.byLap.get(lapValue);
          if (!lapRecords) {
            return {
              lap: lapValue,
              thresholdSec: resolvedThreshold,
              minCars: resolvedMinCars,
              requireGreen: resolvedRequireGreen,
              trackStatus: null,
              trains: [],
              skipped: true,
              skippedReason: 'missing-lap',
            };
          }
          return computeGapTrainsForLap({
            lap: lapValue,
            lapRecords,
            thresholdSec: resolvedThreshold,
            minCars: resolvedMinCars,
            requireGreen: resolvedRequireGreen,
            getDriverName,
          });
        });

        return {
          thresholdSec: resolvedThreshold,
          minCars: resolvedMinCars,
          requireGreen: resolvedRequireGreen,
          laps,
        };
      },
    }),
    get_sc_vsc_deltas: tool({
      description:
        'Compute lap-time deltas under SC/VSC/yellow/red vs green baseline (median). Defaults to field median unless driverNumber is provided.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        includePitLaps: z.boolean().optional(),
      }),
      execute: async ({ driverNumber, startLap, endLap, includePitLaps }) => {
        const defaultEndLap =
          getDefaultEndLap() ?? analysisIndex.lapNumbers.at(-1);
        const resolvedEndLap =
          typeof endLap === 'number'
            ? endLap
            : typeof defaultEndLap === 'number'
              ? defaultEndLap
              : undefined;
        const resolvedStartLap =
          typeof startLap === 'number'
            ? startLap
            : typeof resolvedEndLap === 'number'
              ? resolvedEndLap
              : 1;
        const from =
          typeof resolvedEndLap === 'number'
            ? Math.min(resolvedStartLap, resolvedEndLap)
            : resolvedStartLap;
        const to =
          typeof resolvedEndLap === 'number'
            ? Math.max(resolvedStartLap, resolvedEndLap)
            : resolvedStartLap;
        const driver = driverNumber === undefined ? null : String(driverNumber);
        const report = computeScVscDeltas({
          byLap: analysisIndex.byLap,
          startLap: from,
          endLap: to,
          driverNumber: driver,
          includePitLaps,
        });
        return {
          ...report,
          driverName: driver ? getDriverName(driver) : null,
        };
      },
    }),
    get_pit_loss_estimate: tool({
      description:
        'Estimate pit lane traversal time from PitLaneTimeCollection (Duration). Returns median/mean in ms/sec; lane time only (not full pit loss incl. in/out laps).',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        method: z.enum(['median', 'mean']).optional(),
      }),
      execute: async ({ driverNumber, startLap, endLap, method }) =>
        computePitLaneTimeStats({
          state: processors.pitLaneTimeCollection?.state ?? null,
          method,
          driverNumber:
            driverNumber === undefined ? null : String(driverNumber),
          startLap,
          endLap,
          getDriverName,
        }),
    }),
    get_data_catalog: tool({
      description:
        'Get a catalog of available topics with counts and time ranges. Topic names are canonicalized (e.g. CarData instead of CarData.z).',
      inputSchema: z.object({}),
      execute: async () => analysis.getTopicStats(),
    }),
    inspect_topic: tool({
      description:
        'Summarize the JSON shape for a topic across recent samples. Useful for discovering data structure without dumping full payloads.',
      inputSchema: z.object({
        topic: z.string(),
        samples: z.number().optional(),
        fromIso: z.string().optional(),
        toIso: z.string().optional(),
        maxDepth: z.number().optional(),
        maxKeys: z.number().optional(),
        maxArray: z.number().optional(),
      }),
      execute: async ({
        topic,
        samples,
        fromIso,
        toIso,
        maxDepth,
        maxKeys,
        maxArray,
      }) => {
        const from = fromIso ? new Date(fromIso) : undefined;
        const to = toIso ? new Date(toIso) : undefined;
        let resolved = topic;
        let timeline = analysis.getTopicTimeline(resolved, { from, to });
        if (!timeline.length && !resolved.endsWith('.z')) {
          resolved = `${resolved}.z`;
          timeline = analysis.getTopicTimeline(resolved, { from, to });
        }
        if (!timeline.length) {
          return {
            topic: resolved,
            requested: topic,
            count: 0,
            sampled: 0,
            first: null,
            last: null,
            shape: null,
            latestShape: null,
          };
        }
        const sampleCount = Math.min(
          typeof samples === 'number' && samples > 0 ? samples : 5,
          timeline.length,
        );
        const sampled = timeline.slice(-sampleCount);
        const options = { maxDepth, maxKeys, maxArray };
        const shape = shapeOfMany(
          sampled.map((point) => point.json),
          options,
        );
        const latestShape = shapeOf(sampled[sampled.length - 1]?.json, options);
        return {
          topic: resolved,
          requested: topic,
          count: timeline.length,
          sampled: sampleCount,
          first: timeline[0]?.dateTime ?? null,
          last: timeline[timeline.length - 1]?.dateTime ?? null,
          shape,
          latestShape,
        };
      },
    }),
    get_topic_timeline: tool({
      description:
        'Get normalized timeline for a topic (optionally limited). Useful for inspecting raw updates over time.',
      inputSchema: z.object({
        topic: z.string(),
        limit: z.number().optional(),
        fromIso: z.string().optional(),
        toIso: z.string().optional(),
      }),
      execute: async ({ topic, limit, fromIso, toIso }) => {
        const from = fromIso ? new Date(fromIso) : undefined;
        const to = toIso ? new Date(toIso) : undefined;
        return analysis.getTopicTimeline(topic, { limit, from, to });
      },
    }),
    get_position: tool({
      description: 'Get latest Position entry',
      inputSchema: z.object({}),
      execute: async () => processors.position?.state ?? null,
    }),
    get_position_snapshot: tool({
      description:
        'Get a deterministic per-driver position snapshot by combining Position.z coordinates, latest CarData telemetry, timing order, and driver metadata. Respects the current replay cursor when historical snapshots are available.',
      inputSchema: z.object({
        driverNumber: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async ({ driverNumber }) => {
        const snapshot = getPositionSnapshotView(driverNumber);
        if (!snapshot) {
          return null;
        }

        if (driverNumber !== undefined) {
          return snapshot.drivers[0] ?? null;
        }

        const resolved = resolveCurrentCursor();
        const snapshotDateTime =
          resolved.source === 'time' && currentCursor.iso
            ? new Date(currentCursor.iso)
            : resolved.dateTime;
        return {
          asOf: {
            source: resolved.source,
            lap: resolved.lap,
            dateTime:
              snapshotDateTime instanceof Date &&
              Number.isFinite(snapshotDateTime.getTime())
                ? snapshotDateTime
                : resolved.dateTime,
          },
          ...snapshot,
        };
      },
    }),
    get_heartbeat: tool({
      description: 'Get merged Heartbeat',
      inputSchema: z.object({}),
      execute: async () => {
        const state = processors.heartbeat?.state ?? null;
        return state ? (getHeartbeatSnapshot(state) ?? state) : null;
      },
    }),
    run_py: tool({
      description:
        'Run Python with the call_tool bridge. Returns { ok: true, value } or { ok: false, error, hint? }. Use call_tool for data; vars only for tiny constants (<= 8 KB). See Engineer Python Skill in system prompt.',
      inputSchema: z.object({
        code: z.string(),
        vars: z.record(z.string(), z.any()).optional(),
      }),
      execute: async ({ code, vars }) => {
        const fail = (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          return {
            ok: false,
            error: message,
            hint: classifyPythonFailure(message),
          };
        };

        try {
          assertPythonCodeAllowed(code);
          if (vars !== undefined) {
            const byteCount = estimateJsonBytes(vars);
            if (byteCount === null) {
              return fail(
                'run_py vars must be JSON-serializable; use call_tool for data instead',
              );
            }
            if (byteCount > MAX_PYTHON_VARS_BYTES) {
              return fail(
                `vars payload too large (${byteCount} bytes). Use call_tool for data; vars only for tiny constants (<= 8 KB).`,
              );
            }
          }

          // Always defer to the client's internal init memoization so we recover cleanly
          // if the worker process crashes/restarts.
          await pythonClient.init({
            indexURL: pyodideIndexUrl,
            packageCacheDir: pyodideCacheDir,
          });

          const context = buildPythonContext({ vars });
          let result = await runPy({ code, context, runtime: pythonClient });
          if (!result.ok && /pyodide is not initialized/i.test(result.error)) {
            // The worker likely restarted between init and run. Re-init and retry once.
            await pythonClient.init({
              indexURL: pyodideIndexUrl,
              packageCacheDir: pyodideCacheDir,
            });
            result = await runPy({ code, context, runtime: pythonClient });
          }
          if (!result.ok) {
            return { ...result, hint: classifyPythonFailure(result.error) };
          }
          return result;
        } catch (err) {
          return fail(err);
        }
      },
    }),
    set_time_cursor: tool({
      description: 'Set the as-of cursor for analysis (lap or ISO time).',
      inputSchema: z.object({
        lap: z.number().optional(),
        iso: z.string().optional(),
        latest: z.boolean().optional(),
      }),
      execute: async (cursor) => {
        const next = {
          lap: typeof cursor.lap === 'number' ? cursor.lap : undefined,
          iso: cursor.iso,
          latest: cursor.latest ?? false,
        } as TimeCursor;
        const resolved = analysisIndex.resolveAsOf(next);
        const normalized: TimeCursor =
          resolved.source === 'latest' || typeof resolved.lap !== 'number'
            ? { latest: true }
            : cursor.iso
              ? { lap: resolved.lap, iso: cursor.iso, latest: false }
              : { lap: resolved.lap };
        currentCursor = normalized;
        onTimeCursorChange(normalized);
        return resolved;
      },
    }),
    get_replay_control: tool({
      description:
        'Get the current replay/control state, including the requested cursor, resolved lap/time, and available lap range.',
      inputSchema: z.object({}),
      execute: async () => createReplayApi().getControlState(),
    }),
    step_time_cursor: tool({
      description:
        'Step the analysis cursor forward or backward relative to the current cursor. Use delta for lap stepping or deltaMs for time stepping. Returns structured replay-control state or an explicit error when replay data is unavailable.',
      inputSchema: z.object({
        delta: z.number().int().optional(),
        deltaMs: z.number().optional(),
      }),
      execute: async ({ delta, deltaMs }) => {
        if (typeof deltaMs === 'number') {
          return createReplayApi().applyControl({
            operation: 'step-time',
            deltaMs,
          });
        }

        return createReplayApi().applyControl({
          operation: 'step-lap',
          ...(typeof delta === 'number' ? { delta } : {}),
        });
      },
    }),
    get_stint_pace: tool({
      description: 'Get stint pace summary for a driver.',
      inputSchema: z.object({
        driverNumber: z.string(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
      }),
      execute: async ({ driverNumber, startLap, endLap }) => {
        const defaultEndLap = getDefaultEndLap();
        return analysisIndex.getStintPace({
          driverNumber,
          startLap,
          endLap: endLap ?? defaultEndLap,
        });
      },
    }),
    compare_drivers: tool({
      description: 'Compare two drivers lap-by-lap with summary.',
      inputSchema: z.object({
        driverA: z.string(),
        driverB: z.string(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
      }),
      execute: async ({ driverA, driverB, startLap, endLap }) => {
        const defaultEndLap = getDefaultEndLap();
        return analysisIndex.compareDrivers({
          driverA,
          driverB,
          startLap,
          endLap: endLap ?? defaultEndLap,
        });
      },
    }),
    get_undercut_window: tool({
      description: 'Compute undercut window from lap deltas and pit loss.',
      inputSchema: z.object({
        driverA: z.string(),
        driverB: z.string(),
        pitLossMs: z.number().nullable(),
      }),
      execute: async ({ driverA, driverB, pitLossMs }) => {
        const defaultEndLap = getDefaultEndLap();
        const comparison = analysisIndex.compareDrivers({
          driverA,
          driverB,
          endLap: defaultEndLap,
        });
        const avgDelta = comparison.summary?.avgDeltaMs ?? null;
        if (avgDelta == null || pitLossMs == null) {
          return {
            avgDeltaMs: avgDelta,
            lapsToCover: null,
            pitLossMs: pitLossMs ?? null,
          };
        }
        if (avgDelta >= 0) {
          return { avgDeltaMs: avgDelta, lapsToCover: null, pitLossMs };
        }
        const lapsToCover = Math.ceil(pitLossMs / Math.abs(avgDelta));
        return { avgDeltaMs: avgDelta, lapsToCover, pitLossMs };
      },
    }),
    simulate_rejoin: tool({
      description: 'Project rejoin gap after a pit loss on a given lap.',
      inputSchema: z.object({
        driver: z.string(),
        pitLossMs: z.number(),
        asOfLap: z.number(),
      }),
      execute: async ({ driver, pitLossMs, asOfLap }) =>
        analysisIndex.simulateRejoin({ driver, pitLossMs, asOfLap }),
    }),
    get_position_changes: tool({
      description: 'List position changes by lap.',
      inputSchema: z.object({}),
      execute: async () => {
        const resolved = resolveCurrentCursor();
        const changes = analysisIndex.getPositionChanges();
        const lap = resolved.lap;
        if (typeof lap !== 'number') return changes;
        return changes.filter((change) => change.lap <= lap);
      },
    }),
    get_clean_lap_pace: tool({
      description:
        'Compare two drivers on clean laps only (filters pit/neutralization by TrackStatus). Returns per-lap deltas and exclusions.',
      inputSchema: z.object({
        driverA: z.union([z.string(), z.number()]),
        driverB: z.union([z.string(), z.number()]),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
        limit: z.number().optional(),
        includePitLaps: z.boolean().optional(),
        requireGreen: z.boolean().optional(),
      }),
      execute: async ({
        driverA,
        driverB,
        startLap,
        endLap,
        limit,
        includePitLaps,
        requireGreen,
      }) => {
        const timing = processors.timingData;
        if (!timing) return null;
        const a = String(driverA);
        const b = String(driverB);
        const defaultEndLap = getDefaultEndLap();
        const resolvedEndLap =
          typeof endLap === 'number' ? endLap : defaultEndLap;
        const lapNumbers = timing.getLapNumbers?.() ?? [];
        if (!lapNumbers.length)
          return { laps: [], excluded: {}, summary: null };
        let laps = lapNumbers;
        if (typeof startLap === 'number')
          laps = laps.filter((lap) => lap >= startLap);
        if (typeof resolvedEndLap === 'number') {
          laps = laps.filter((lap) => lap <= resolvedEndLap);
        }
        if (typeof limit === 'number' && limit > 0) laps = laps.slice(-limit);

        const excluded: Record<string, number[]> = {
          missingSnapshot: [],
          missingLapTime: [],
          pitLap: [],
          nonGreen: [],
        };
        const lapResults: Array<{
          lap: number;
          aMs: number;
          bMs: number;
          deltaMs: number;
          trackStatus: { status: string | null; message: string | null } | null;
        }> = [];

        const requireGreenFlag = requireGreen !== false;
        const allowPit = includePitLaps === true;

        for (const lap of laps) {
          const aSnap = timing.getLapSnapshot?.(a, lap) ?? null;
          const bSnap = timing.getLapSnapshot?.(b, lap) ?? null;
          if (!aSnap || !bSnap) {
            excluded.missingSnapshot.push(lap);
            continue;
          }
          const aMs = extractLapTimeMs(aSnap, { preferPrevious: true });
          const bMs = extractLapTimeMs(bSnap, { preferPrevious: true });
          if (aMs === null || bMs === null) {
            excluded.missingLapTime.push(lap);
            continue;
          }
          if (!allowPit && (isPitLap(aSnap) || isPitLap(bSnap))) {
            excluded.pitLap.push(lap);
            continue;
          }
          const dt =
            ((aSnap as any)?.__dateTime as Date | undefined) ??
            ((bSnap as any)?.__dateTime as Date | undefined);
          const track = dt
            ? processors.trackStatus?.getAt?.(dt)
            : processors.trackStatus?.state;
          if (requireGreenFlag && track) {
            const status = (track as any)?.Status;
            const message = (track as any)?.Message;
            if (!trackStatusIsGreen(status, message)) {
              excluded.nonGreen.push(lap);
              continue;
            }
          }
          lapResults.push({
            lap,
            aMs,
            bMs,
            deltaMs: aMs - bMs,
            trackStatus: track
              ? {
                  status: (track as any)?.Status
                    ? String((track as any).Status)
                    : null,
                  message: (track as any)?.Message
                    ? String((track as any).Message)
                    : null,
                }
              : null,
          });
        }

        const avgDeltaMs =
          lapResults.length > 0
            ? lapResults.reduce((acc, value) => acc + value.deltaMs, 0) /
              lapResults.length
            : null;
        const summary = {
          driverA: { number: a, name: getDriverName(a) },
          driverB: { number: b, name: getDriverName(b) },
          compared: lapResults.length,
          fasterA: lapResults.filter((lap) => lap.deltaMs < 0).length,
          fasterB: lapResults.filter((lap) => lap.deltaMs > 0).length,
          equal: lapResults.filter((lap) => lap.deltaMs === 0).length,
          avgDeltaMs,
        };

        return { laps: lapResults, excluded, summary };
      },
    }),
  };
  toolsByName = tools;
  return tools;
}
