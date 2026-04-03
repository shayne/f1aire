import { performance } from 'node:perf_hooks';

export type PerfLogger = (event: Record<string, unknown>) => void;

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
