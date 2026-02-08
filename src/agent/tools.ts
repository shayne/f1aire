import { tool } from 'ai';
import { z } from 'zod';
import type { SessionStore } from '../core/session-store.js';
import type { RawPoint } from '../core/processors/types.js';
import { normalizePoint } from '../core/processors/normalize.js';
import { parseLapTimeMs } from '../core/summary.js';
import { runPy } from './run-py.js';
import { isPlainObject } from '../core/processors/merge.js';
import { createPythonClient } from './pyodide/client.js';
import { buildPythonContext } from './pyodide/context.js';
import { getPyodideBaseDir, getPyodideIndexUrl } from './pyodide/paths.js';
import {
  decodeCarChannels,
  decodeSegmentStatus,
  extractLapTimeMs,
  extractSegmentStatuses,
  extractSectorTimesMs,
  isCleanLap,
  isPitLap,
  parseGapSeconds,
  parseIntervalSeconds,
  smartGapToLeaderSeconds,
  trackStatusIsGreen,
} from '../core/analysis-utils.js';
import { createAnalysisContext } from '../core/analysis.js';
import { buildAnalysisIndex } from '../core/analysis-index.js';
import { shapeOf, shapeOfMany } from '../core/inspect.js';
import {
  computeGapTrainsForLap,
  computePitLaneTimeStats,
  computeScVscDeltas,
} from '../core/race-engineer-metrics.js';
import type { TimeCursor } from '../core/time-cursor.js';
import { getDataBookIndex, getDataBookTopic } from './data-book/data-book.js';

const MAX_PYTHON_VARS_BYTES = 8 * 1024;
const ASYNCIO_RUN_PATTERNS = [
  /\basyncio\.run\s*\(/,
  /\brun_until_complete\s*\(/,
];
const MICROPIP_PATTERNS = [
  /\bmicropip\.install\s*\(/,
];

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
  }
  catch {
    return null;
  }
}

export function makeTools({
  store,
  processors,
  timeCursor,
  onTimeCursorChange,
  logger,
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
      getLapHistory?: (driverNumber: string) => Array<{ lap: number; snapshot: unknown }>;
      getLapSnapshot?: (driverNumber: string, lap: number) => unknown | null;
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
    extrapolatedClock?: { state?: unknown | null };
    topThree?: { state?: unknown | null };
    raceControlMessages?: { state?: unknown | null };
    teamRadio?: { state?: unknown | null };
    championshipPrediction?: { state?: unknown | null };
    pitStopSeries?: { state?: unknown | null };
    pitStop?: { state?: unknown | null };
    pitLaneTimeCollection?: { state?: unknown | null };
    carData?: { state?: unknown | null };
    position?: { state?: unknown | null };
  };
  timeCursor: TimeCursor;
  onTimeCursorChange: (cursor: TimeCursor) => void;
  logger?: (event: Record<string, unknown>) => void | Promise<void>;
}) {
  const getNormalizedLatest = (topic: string) => {
    const direct = store.topic(topic).latest as RawPoint | null;
    const fallback =
      direct ?? (store.topic(`${topic}.z`).latest as RawPoint | null);
    if (!fallback) return null;
    return normalizePoint(fallback);
  };
  const getDriverName = (driverNumber: string) =>
    processors.driverList?.getName?.(driverNumber) ?? null;

  const analysis = createAnalysisContext({ store, processors });
  const analysisIndex = buildAnalysisIndex({ processors });
  let currentCursor: TimeCursor = { ...timeCursor };
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
  const getDefaultEndLap = () => {
    const resolved = resolveCurrentCursor();
    return typeof resolved.lap === 'number' ? resolved.lap : undefined;
  };

  const getLatestCarEntry = () => {
    const state = processors.carData?.state as any;
    const entries = Array.isArray(state?.Entries) ? (state.Entries as any[]) : [];
    if (!entries.length) return null;
    return entries[entries.length - 1];
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

  const pickLastIndexedValues = (value: unknown, limit: number) => {
    if (!isPlainObject(value)) return null;
    const keys = Object.keys(value).sort((a, b) => Number(a) - Number(b));
    const out: Record<string, unknown> = {};
    for (const key of keys.slice(-limit)) {
      out[key] = (value as any)[key];
    }
    return out;
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

  const buildTopicExample = (canonicalTopic: string, driverNumber?: string | number) => {
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
      const driver = resolvedDriver && resolvedDriver in lines ? resolvedDriver : leader;
      const driverSnap = driver ? lines[driver] : null;
      return {
        asOf,
        leader: leader
          ? { driverNumber: leader, driverName: getDriverName(leader), snapshot: pickTimingLine(leaderSnap) }
          : null,
        driver: driver
          ? { driverNumber: driver, driverName: getDriverName(driver), snapshot: pickTimingLine(driverSnap) }
          : null,
      };
    }

    if (topic === 'TrackStatus') {
      const current = processors.trackStatus?.state ?? null;
      const history = processors.trackStatus?.history ?? [];
      return {
        asOf,
        current: current ? pickKnownKeys(current, ['Status', 'Message']) ?? current : null,
        recent: history.slice(-6).map((entry) => ({
          at: entry.at,
          status: entry.status,
          message: entry.message,
        })),
      };
    }

    if (topic === 'RaceControlMessages') {
      const state = processors.raceControlMessages?.state as any;
      const messages = state?.Messages;
      return {
        asOf,
        count: isPlainObject(messages) ? Object.keys(messages).length : null,
        recent: pickLastIndexedValues(messages, 8),
      };
    }

    if (topic === 'TeamRadio') {
      const state = processors.teamRadio?.state as any;
      const captures = state?.Captures;
      const recent = pickLastIndexedValues(captures, 5);
      if (recent && isPlainObject(recent)) {
        for (const key of Object.keys(recent)) {
          const value = (recent as any)[key];
          (recent as any)[key] = pickKnownKeys(value, ['Utc', 'RacingNumber', 'Path']) ?? value;
        }
      }
      return { asOf, count: isPlainObject(captures) ? Object.keys(captures).length : null, recent };
    }

    if (topic === 'CarData') {
      const entry = getLatestCarEntry();
      if (!entry) return null;
      const cars = (entry as any)?.Cars ?? {};
      if (!isPlainObject(cars)) return null;
      if (resolvedDriver && resolvedDriver in cars) {
        const car = (cars as any)[resolvedDriver];
        const channels = (car as any)?.Channels ?? null;
        return {
          asOf,
          utc: (entry as any)?.Utc ?? null,
          driverNumber: resolvedDriver,
          driverName: getDriverName(resolvedDriver),
          channels: decodeCarChannels(channels),
        };
      }
      const first = Object.keys(cars)[0];
      if (!first) return { asOf, utc: (entry as any)?.Utc ?? null, sample: null };
      const car = (cars as any)[first];
      return {
        asOf,
        utc: (entry as any)?.Utc ?? null,
        driverNumber: first,
        driverName: getDriverName(first),
        channels: decodeCarChannels((car as any)?.Channels ?? null),
      };
    }

    if (topic === 'Position') {
      const state = processors.position?.state as any;
      const batches = Array.isArray(state?.Position) ? (state.Position as any[]) : [];
      if (!batches.length) return null;
      const latest = batches[batches.length - 1];
      const entries = latest?.Entries ?? {};
      if (!isPlainObject(entries)) return null;
      const key = resolvedDriver && resolvedDriver in entries ? resolvedDriver : Object.keys(entries)[0];
      const sample = key ? entries[key] : null;
      return {
        asOf,
        timestamp: latest?.Timestamp ?? null,
        driverNumber: key ?? null,
        driverName: key ? getDriverName(key) : null,
        entry: sample ? pickKnownKeys(sample, ['Status', 'X', 'Y', 'Z']) ?? sample : null,
      };
    }

    if (topic === 'TimingAppData') {
      const state = processors.timingAppData?.state as any;
      const lines = state?.Lines ?? {};
      if (!isPlainObject(lines)) return null;
      const key = resolvedDriver && resolvedDriver in lines ? resolvedDriver : Object.keys(lines)[0];
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

    if (topic === 'WeatherData') {
      const state = processors.weatherData?.state ?? null;
      if (!state) return null;
      const preferred = pickKnownKeys(state, [
        'AirTemp',
        'TrackTemp',
        'Humidity',
        'Pressure',
        'WindSpeed',
        'WindDirection',
        'Rainfall',
      ]);
      return { asOf, weather: preferred ?? state };
    }

    if (topic === 'ExtrapolatedClock') {
      const state = processors.extrapolatedClock?.state ?? null;
      if (!state) return null;
      return { asOf, clock: pickKnownKeys(state, ['Utc', 'Remaining', 'Extrapolating']) ?? state };
    }

    if (topic === 'SessionInfo') {
      const state = processors.sessionInfo?.state ?? null;
      if (!state) return null;
      return { asOf, sessionInfo: pickKnownKeys(state, ['Name', 'Type', 'Path', 'Meeting', 'Circuit']) ?? state };
    }

    if (topic === 'SessionData') {
      const state = processors.sessionData?.state ?? null;
      if (!state) return null;
      return {
        asOf,
        sessionData: pickKnownKeys(state, ['Series', 'StatusSeries']) ?? state,
      };
    }

    if (topic === 'TopThree') {
      const state = processors.topThree?.state as any;
      if (!state) return null;
      const lines = Array.isArray(state?.Lines) ? state.Lines.slice(0, 3) : state?.Lines ?? null;
      return { asOf, withheld: state?.Withheld ?? null, lines };
    }

    if (topic === 'TimingStats') {
      const state = processors.timingStats?.state as any;
      if (!state) return null;
      const lines = state?.Lines ?? null;
      if (resolvedDriver && isPlainObject(lines) && resolvedDriver in lines) {
        return { asOf, driverNumber: resolvedDriver, driverName: getDriverName(resolvedDriver), stats: lines[resolvedDriver] };
      }
      return { asOf, keys: isPlainObject(lines) ? Object.keys(lines).slice(0, 10) : null };
    }

    if (topic === 'LapCount') {
      const state = processors.lapCount?.state ?? null;
      if (!state) return null;
      return { asOf, lapCount: pickKnownKeys(state, ['CurrentLap', 'TotalLaps']) ?? state };
    }

    if (topic === 'ChampionshipPrediction') {
      const state = processors.championshipPrediction?.state as any;
      if (!state) return null;
      const drivers = state?.Drivers;
      if (isPlainObject(drivers)) {
        const list = Object.values(drivers)
          .filter((x) => isPlainObject(x))
          .map((x) => x as any)
          .sort((a, b) => Number(a?.PredictedPosition ?? 999) - Number(b?.PredictedPosition ?? 999))
          .slice(0, 6)
          .map((d) => pickKnownKeys(d, ['RacingNumber', 'CurrentPosition', 'PredictedPosition', 'CurrentPoints', 'PredictedPoints']) ?? d);
        return { asOf, drivers: list };
      }
      return { asOf, keys: state ? Object.keys(state).filter((k) => k !== '_kf').slice(0, 10) : null };
    }

    if (topic === 'PitLaneTimeCollection') {
      const state = processors.pitLaneTimeCollection?.state as any;
      if (!state) return null;
      const pitTimes = state?.PitTimes;
      if (!isPlainObject(pitTimes)) return { asOf, pitTimes: null };
      const key = resolvedDriver && resolvedDriver in pitTimes ? resolvedDriver : Object.keys(pitTimes)[0];
      const entry = key ? pitTimes[key] : null;
      return { asOf, driverNumber: key ?? null, driverName: key ? getDriverName(key) : null, pitTime: entry };
    }

    if (topic === 'PitStopSeries') {
      const state = processors.pitStopSeries?.state as any;
      if (!state) return null;
      const pitTimes = state?.PitTimes;
      if (!isPlainObject(pitTimes)) return { asOf, pitTimes: null };
      const key = resolvedDriver && resolvedDriver in pitTimes ? resolvedDriver : Object.keys(pitTimes)[0];
      const driverStops = key ? pitTimes[key] : null;
      return { asOf, driverNumber: key ?? null, driverName: key ? getDriverName(key) : null, stops: pickLastIndexedValues(driverStops, 3) ?? driverStops };
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
    return { asOf, value: pickKnownKeys(json, Object.keys(json).filter((k) => k !== '_kf').slice(0, 12)) ?? json };
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

        // Determine whether we have data loaded for this topic.
        const presentByProcessor = (() => {
          switch (canonical) {
            case 'SessionInfo':
              return processors.sessionInfo?.state != null;
            case 'Heartbeat':
              return processors.heartbeat?.state != null;
            case 'DriverList':
              return processors.driverList?.state != null;
            case 'TimingData':
              return processors.timingData?.state != null;
            case 'TimingAppData':
              return processors.timingAppData?.state != null;
            case 'TimingStats':
              return processors.timingStats?.state != null;
            case 'TrackStatus':
              return processors.trackStatus?.state != null;
            case 'LapCount':
              return processors.lapCount?.state != null;
            case 'WeatherData':
              return processors.weatherData?.state != null;
            case 'SessionData':
              return processors.sessionData?.state != null;
            case 'ExtrapolatedClock':
              return processors.extrapolatedClock?.state != null;
            case 'TopThree':
              return processors.topThree?.state != null;
            case 'RaceControlMessages':
              return processors.raceControlMessages?.state != null;
            case 'TeamRadio':
              return processors.teamRadio?.state != null;
            case 'ChampionshipPrediction':
              return processors.championshipPrediction?.state != null;
            case 'PitStopSeries':
              return processors.pitStopSeries?.state != null;
            case 'PitStop':
              return processors.pitStop?.state != null;
            case 'PitLaneTimeCollection':
              return processors.pitLaneTimeCollection?.state != null;
            case 'CarData':
              return processors.carData?.state != null;
            case 'Position':
              return processors.position?.state != null;
            default:
              return null;
          }
        })();

        const present =
          presentByProcessor === null
            ? getNormalizedLatest(canonical) !== null
            : presentByProcessor;

        return {
          requested: topic,
          canonicalTopic: canonical,
          found: Boolean(entry),
          present,
          reference: entry,
          example:
            includeExample === false ? null : buildTopicExample(canonical, driverNumber),
        };
      },
    }),
    get_download_manifest: tool({
      description:
        'Get the download manifest for this session (topics attempted, per-topic success/failure). Useful to prove coverage and explain missing topics.',
      inputSchema: z.object({}),
      execute: async () => (store.raw as any)?.download ?? null,
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
    get_timing_app_data: tool({
      description: 'Get merged TimingAppData state (stints, tyres)',
      inputSchema: z.object({}),
      execute: async () => processors.timingAppData?.state ?? null,
    }),
    get_timing_stats: tool({
      description: 'Get merged TimingStats state (best speeds, sectors)',
      inputSchema: z.object({}),
      execute: async () => processors.timingStats?.state ?? null,
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
      execute: async () => processors.lapCount?.state ?? null,
    }),
    get_weather: tool({
      description: 'Get merged WeatherData',
      inputSchema: z.object({}),
      execute: async () => processors.weatherData?.state ?? null,
    }),
    get_session_info: tool({
      description: 'Get merged SessionInfo',
      inputSchema: z.object({}),
      execute: async () => processors.sessionInfo?.state ?? null,
    }),
    get_session_data: tool({
      description: 'Get merged SessionData',
      inputSchema: z.object({}),
      execute: async () => processors.sessionData?.state ?? null,
    }),
    get_extrapolated_clock: tool({
      description: 'Get merged ExtrapolatedClock',
      inputSchema: z.object({}),
      execute: async () => processors.extrapolatedClock?.state ?? null,
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
    get_team_radio: tool({
      description: 'Get merged TeamRadio (Captures dict)',
      inputSchema: z.object({}),
      execute: async () => processors.teamRadio?.state ?? null,
    }),
    get_championship_prediction: tool({
      description: 'Get merged ChampionshipPrediction',
      inputSchema: z.object({}),
      execute: async () => processors.championshipPrediction?.state ?? null,
    }),
    get_pit_stop_series: tool({
      description: 'Get merged PitStopSeries',
      inputSchema: z.object({}),
      execute: async () => processors.pitStopSeries?.state ?? null,
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
      inputSchema: z.object({ driverNumber: z.union([z.string(), z.number()]).optional() }),
      execute: async ({ driverNumber }) => {
        const entry = getLatestCarEntry();
        if (!entry) return null;
        const cars = (entry as any)?.Cars ?? {};
        if (!isPlainObject(cars)) return null;
        if (driverNumber !== undefined) {
          const num = String(driverNumber);
          const car = (cars as any)[num];
          const channels = (car as any)?.Channels ?? null;
          return {
            utc: (entry as any)?.Utc ?? null,
            driverNumber: num,
            channels: decodeCarChannels(channels),
          };
        }
        const all: Record<string, unknown> = {};
        for (const [num, car] of Object.entries(cars)) {
          const channels = (car as any)?.Channels ?? null;
          all[num] = decodeCarChannels(channels);
        }
        return { utc: (entry as any)?.Utc ?? null, drivers: all };
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
      execute: async ({ lap, startLap, endLap, thresholdSec, minCars, requireGreen }) => {
        const defaultEndLap = getDefaultEndLap() ?? analysisIndex.lapNumbers.at(-1);
        const resolvedThreshold = typeof thresholdSec === 'number' && thresholdSec > 0 ? thresholdSec : 1.0;
        const resolvedMinCars = typeof minCars === 'number' && minCars >= 2 ? Math.floor(minCars) : 3;
        const resolvedRequireGreen = requireGreen !== false;

        const lapList: number[] = [];
        if (typeof lap === 'number') {
          lapList.push(lap);
        } else {
          const resolvedEnd = typeof endLap === 'number' ? endLap : defaultEndLap;
          if (typeof resolvedEnd === 'number') {
            const resolvedStart = typeof startLap === 'number' ? startLap : resolvedEnd;
            const from = Math.min(resolvedStart, resolvedEnd);
            const to = Math.max(resolvedStart, resolvedEnd);
            for (let current = from; current <= to; current += 1) lapList.push(current);
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
        const defaultEndLap = getDefaultEndLap() ?? analysisIndex.lapNumbers.at(-1);
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
          driverNumber: driverNumber === undefined ? null : String(driverNumber),
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
        const shape = shapeOfMany(sampled.map((point) => point.json), options);
        const latestShape = shapeOf(
          sampled[sampled.length - 1]?.json,
          options,
        );
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
    get_heartbeat: tool({
      description: 'Get merged Heartbeat',
      inputSchema: z.object({}),
      execute: async () => processors.heartbeat?.state ?? null,
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
          return { ok: false, error: message, hint: classifyPythonFailure(message) };
        };

        try {
          assertPythonCodeAllowed(code);
          if (vars !== undefined) {
            const byteCount = estimateJsonBytes(vars);
            if (byteCount === null) {
              return fail('run_py vars must be JSON-serializable; use call_tool for data instead');
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
          return { avgDeltaMs: avgDelta, lapsToCover: null, pitLossMs: pitLossMs ?? null };
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
        const resolvedEndLap = typeof endLap === 'number' ? endLap : defaultEndLap;
        const lapNumbers = timing.getLapNumbers?.() ?? [];
        if (!lapNumbers.length) return { laps: [], excluded: {}, summary: null };
        let laps = lapNumbers;
        if (typeof startLap === 'number') laps = laps.filter((lap) => lap >= startLap);
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
            ((aSnap as any)?.__dateTime as Date | undefined)
            ?? ((bSnap as any)?.__dateTime as Date | undefined);
          const track = dt ? processors.trackStatus?.getAt?.(dt) : processors.trackStatus?.state;
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
                  status: (track as any)?.Status ? String((track as any).Status) : null,
                  message: (track as any)?.Message ? String((track as any).Message) : null,
                }
              : null,
          });
        }

        const avgDeltaMs =
          lapResults.length > 0
            ? lapResults.reduce((acc, value) => acc + value.deltaMs, 0) / lapResults.length
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
