import { performance } from 'node:perf_hooks';

export type PerfLogger = (event: Record<string, unknown>) => void;

export type RenderBudgetEvent = {
  type: 'render-budget';
  durationMs: number;
};

export type EventLoopLagOptions = {
  intervalMs?: number;
  warnMs?: number;
  logger?: PerfLogger | null;
  now?: () => number;
  setIntervalFn?: (cb: () => void, intervalMs: number) => NodeJS.Timeout;
  clearIntervalFn?: (id: NodeJS.Timeout) => void;
};

export function startEventLoopLagMonitor({
  intervalMs = 100,
  warnMs = 200,
  logger,
  now = () => performance.now(),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: EventLoopLagOptions): () => void {
  let expected = now() + intervalMs;
  const id = setIntervalFn(() => {
    const current = now();
    const lag = current - expected;
    expected = current + intervalMs;
    if (lag >= warnMs && logger) {
      logger({
        type: 'event-loop-lag',
        lagMs: Math.round(lag),
        intervalMs,
      });
    }
  }, intervalMs);

  return () => {
    clearIntervalFn(id);
  };
}

export function createRenderBudgetLogger({
  warnMs,
  now = () => performance.now(),
  write = () => {},
}: {
  warnMs: number;
  now?: () => number;
  write?: (event: RenderBudgetEvent) => void;
}) {
  return function measureRender<T>(work: () => T): T {
    const start = now();
    const value = work();
    const durationMs = now() - start;

    if (durationMs >= warnMs) {
      write({
        type: 'render-budget',
        durationMs,
      });
    }

    return value;
  };
}
