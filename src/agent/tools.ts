import { tool } from 'ai';
import { z } from 'zod';
import { engineerJsSkill } from './prompt.js';

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type SessionStoreLike = {
  topic: (name: string) => { latest?: unknown; timeline?: (from?: string, to?: string) => unknown } | undefined;
};

export type ProcessorsLike = {
  timingData?: {
    latest?: unknown;
    snapshot?: (ts?: string) => unknown;
    lapTimes?: Record<string, unknown>;
  };
  timingAppData?: {
    latest?: unknown;
    stints?: Record<string, unknown>;
  };
  driverList?: {
    latest?: Record<string, unknown>;
  };
  [key: string]: unknown;
};

export type RunJs = (code: string) => Promise<unknown>;

export type EngineerToolsContext = {
  store: SessionStoreLike;
  processors: ProcessorsLike;
  runJs: RunJs;
};

function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

function fail(message: string): ToolResult<never> {
  return { ok: false, error: message };
}

function resolveDriverList(processors: ProcessorsLike): Record<string, unknown> | null {
  const driverList = processors.driverList as { latest?: Record<string, unknown> } | undefined;
  if (!driverList) return null;
  return driverList.latest ?? null;
}

function pickDriver(drivers: Record<string, unknown>, driverNumber: string): unknown {
  const trimmed = driverNumber.trim();
  if (!trimmed) return undefined;
  return drivers[trimmed] ?? drivers[String(Number(trimmed))];
}

function resolveLapTimes(processors: ProcessorsLike, driverNumber: string): unknown {
  const timing = processors.timingData as {
    lapTimes?: Record<string, unknown>;
    latest?: Record<string, unknown>;
  } | undefined;
  if (!timing) return undefined;
  if (timing.lapTimes && driverNumber in timing.lapTimes) return timing.lapTimes[driverNumber];
  const latest = timing.latest as Record<string, unknown> | undefined;
  const laps = latest?.Laps as Record<string, unknown> | undefined;
  if (laps && driverNumber in laps) return laps[driverNumber];
  const lapTimes = latest?.LapTimes as Record<string, unknown> | undefined;
  if (lapTimes && driverNumber in lapTimes) return lapTimes[driverNumber];
  return undefined;
}

function resolveStints(processors: ProcessorsLike, driverNumber: string): unknown {
  const timingApp = processors.timingAppData as {
    stints?: Record<string, unknown>;
    latest?: Record<string, unknown>;
  } | undefined;
  if (!timingApp) return undefined;
  if (timingApp.stints && driverNumber in timingApp.stints) return timingApp.stints[driverNumber];
  const latest = timingApp.latest as Record<string, unknown> | undefined;
  const stints = latest?.Stints as Record<string, unknown> | undefined;
  if (stints && driverNumber in stints) return stints[driverNumber];
  return undefined;
}

export function createEngineerTools({ store, processors, runJs }: EngineerToolsContext) {
  return {
    get_latest: tool({
      description: 'Return the latest snapshot for a raw timing topic.',
      parameters: z.object({
        topic: z.string().min(1),
      }),
      execute: async ({ topic }: { topic: string }) => {
        if (!store?.topic) return fail('Session store is unavailable.');
        const entry = store.topic(topic);
        if (!entry) return fail(`Unknown topic: ${topic}`);
        if (entry.latest === undefined || entry.latest === null) {
          return fail(`No latest data for topic: ${topic}`);
        }
        return ok(entry.latest);
      },
    }),
    get_timing_snapshot: tool({
      description: 'Return a timing snapshot at an optional timestamp.',
      parameters: z.object({
        ts: z.string().min(1).optional(),
      }),
      execute: async ({ ts }: { ts?: string }) => {
        const timing = processors.timingData as { snapshot?: (ts?: string) => unknown; latest?: unknown } | undefined;
        if (timing?.snapshot) return ok(timing.snapshot(ts));
        if (!ts) {
          if (timing?.latest !== undefined && timing?.latest !== null) return ok(timing.latest);
          const fallback = store.topic('TimingData')?.latest;
          if (fallback !== undefined && fallback !== null) return ok(fallback);
        }
        return fail('Timing snapshot is unavailable.');
      },
    }),
    get_driver_list: tool({
      description: 'Return the latest driver list with metadata.',
      parameters: z.object({}),
      execute: async () => {
        const drivers = resolveDriverList(processors);
        if (!drivers) return fail('Driver list is unavailable.');
        return ok(drivers);
      },
    }),
    get_driver: tool({
      description: 'Return metadata for a single driver number.',
      parameters: z.object({
        driverNumber: z.string().min(1),
      }),
      execute: async ({ driverNumber }: { driverNumber: string }) => {
        const drivers = resolveDriverList(processors);
        if (!drivers) return fail('Driver list is unavailable.');
        const driver = pickDriver(drivers, driverNumber);
        if (!driver) return fail(`Driver ${driverNumber} not found.`);
        return ok(driver);
      },
    }),
    get_lap_times: tool({
      description: 'Return lap times for a driver number.',
      parameters: z.object({
        driverNumber: z.string().min(1),
      }),
      execute: async ({ driverNumber }: { driverNumber: string }) => {
        const lapTimes = resolveLapTimes(processors, driverNumber);
        if (!lapTimes) return fail(`Lap times for driver ${driverNumber} are unavailable.`);
        return ok(lapTimes);
      },
    }),
    get_stints: tool({
      description: 'Return stint data for a driver number.',
      parameters: z.object({
        driverNumber: z.string().min(1),
      }),
      execute: async ({ driverNumber }: { driverNumber: string }) => {
        const stints = resolveStints(processors, driverNumber);
        if (!stints) return fail(`Stints for driver ${driverNumber} are unavailable.`);
        return ok(stints);
      },
    }),
    run_js: tool({
      description: `Execute JavaScript for bespoke analysis.\n\n${engineerJsSkill}`,
      parameters: z.object({
        code: z.string().min(1),
      }),
      execute: async ({ code }: { code: string }) => {
        try {
          const result = await runJs(code);
          return ok(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return fail(`run_js failed: ${message}`);
        }
      },
    }),
  };
}
