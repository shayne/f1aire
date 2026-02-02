import { tool } from 'ai';
import { z } from 'zod';
import type { SessionStore } from '../core/session-store.js';
import type { RawPoint } from '../core/processors/types.js';
import { normalizePoint } from '../core/processors/normalize.js';
import { parseLapTimeMs } from '../core/summary.js';
import { runJs } from './run-js.js';
import { isPlainObject } from '../core/processors/merge.js';
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
import type { TimeCursor } from '../core/time-cursor.js';

export function makeTools({
  store,
  processors,
  timeCursor,
  onTimeCursorChange,
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
  timeCursor?: TimeCursor;
  onTimeCursorChange?: (cursor: TimeCursor) => void;
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
  const handleTimeCursorChange = onTimeCursorChange ?? (() => {});

  const getLatestCarEntry = () => {
    const state = processors.carData?.state as any;
    const entries = Array.isArray(state?.Entries) ? (state.Entries as any[]) : [];
    if (!entries.length) return null;
    return entries[entries.length - 1];
  };

  return {
    get_latest: tool({
      description:
        'Get latest snapshot for a topic (normalized RawPoint; .z topics are decompressed)',
      inputSchema: z.object({ topic: z.string() }),
      execute: async ({ topic }) => getNormalizedLatest(topic),
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
        'Get per-lap table derived from TimingData (lap time, sectors, gaps, stints, optional segments). Useful for any lap-based analysis.',
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
      execute: async (opts) => analysis.getLapTable(opts),
    }),
    get_data_catalog: tool({
      description:
        'Get a catalog of available topics with counts and time ranges.',
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
    run_js: tool({
      description:
        'Run JS/TS using store/processors/raw. See Engineer JS Skill in system prompt.',
      inputSchema: z.object({ code: z.string() }),
      execute: async ({ code }) =>
        runJs({
          code,
          context: {
            store,
            processors,
            raw: store.raw,
            helpers: {
              parseLapTimeMs,
              normalizePoint,
              getDriverName,
              decodeCarChannels,
              decodeSegmentStatus,
              extractLapTimeMs,
              extractSegmentStatuses,
              extractSectorTimesMs,
              isCleanLap,
              trackStatusIsGreen,
              isPitLap,
              getTrackStatusAt: (dateTime: Date) =>
                processors.trackStatus?.getAt?.(dateTime) ?? null,
              parseGapSeconds,
              parseIntervalSeconds,
              smartGapToLeaderSeconds,
              shapeOf,
              shapeOfMany,
            },
            analysis,
          },
        }),
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
        handleTimeCursorChange(next);
        return analysisIndex.resolveAsOf(next);
      },
    }),
    get_stint_pace: tool({
      description: 'Get stint pace summary for a driver.',
      inputSchema: z.object({
        driverNumber: z.string(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
      }),
      execute: async ({ driverNumber, startLap, endLap }) =>
        analysisIndex.getStintPace({ driverNumber, startLap, endLap }),
    }),
    compare_drivers: tool({
      description: 'Compare two drivers lap-by-lap with summary.',
      inputSchema: z.object({
        driverA: z.string(),
        driverB: z.string(),
        startLap: z.number().optional(),
        endLap: z.number().optional(),
      }),
      execute: async ({ driverA, driverB, startLap, endLap }) =>
        analysisIndex.compareDrivers({ driverA, driverB, startLap, endLap }),
    }),
    get_undercut_window: tool({
      description: 'Compute undercut window from lap deltas and pit loss.',
      inputSchema: z.object({
        driverA: z.string(),
        driverB: z.string(),
        pitLossMs: z.number().nullable(),
      }),
      execute: async ({ driverA, driverB, pitLossMs }) =>
        analysisIndex.getUndercutWindow({ driverA, driverB, pitLossMs }),
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
      execute: async () => analysisIndex.getPositionChanges(),
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
        const lapNumbers = timing.getLapNumbers?.() ?? [];
        if (!lapNumbers.length) return { laps: [], excluded: {}, summary: null };
        let laps = lapNumbers;
        if (typeof startLap === 'number') laps = laps.filter((lap) => lap >= startLap);
        if (typeof endLap === 'number') laps = laps.filter((lap) => lap <= endLap);
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
}
