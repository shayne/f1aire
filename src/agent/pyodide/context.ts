import type { SessionStore } from '../../core/session-store.js';

const PROCESSOR_KEYS = [
  'timingData',
  'driverList',
  'timingAppData',
  'timingStats',
  'trackStatus',
  'lapCount',
  'weatherData',
  'sessionInfo',
  'sessionData',
  'extrapolatedClock',
  'topThree',
  'raceControlMessages',
  'teamRadio',
  'championshipPrediction',
  'pitStopSeries',
  'pitLaneTimeCollection',
  'pitStop',
  'carData',
  'position',
  'heartbeat',
] as const;

type ProcessorKey = (typeof PROCESSOR_KEYS)[number];

type ProcessorsLike = Partial<Record<ProcessorKey, { state?: unknown | null }>>;

export type PythonContext = {
  raw: SessionStore['raw'];
  processors: Record<ProcessorKey, unknown | null>;
  vars?: Record<string, unknown>;
};

export function buildPythonContext({
  store,
  processors,
  vars,
}: {
  store: SessionStore;
  processors: ProcessorsLike;
  vars?: Record<string, unknown>;
}): PythonContext {
  const processorStates = {} as Record<ProcessorKey, unknown | null>;
  for (const key of PROCESSOR_KEYS) {
    processorStates[key] = processors[key]?.state ?? null;
  }
  return {
    raw: store.raw,
    processors: processorStates,
    vars,
  };
}
