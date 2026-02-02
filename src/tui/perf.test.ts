import { describe, expect, it, vi } from 'vitest';
import { startEventLoopLagMonitor } from './perf.js';

describe('startEventLoopLagMonitor', () => {
  it('logs when lag exceeds threshold', () => {
    let now = 0;
    let tick: (() => void) | null = null;
    const logger = vi.fn();
    const clearIntervalFn = vi.fn();

    const stop = startEventLoopLagMonitor({
      intervalMs: 100,
      warnMs: 50,
      logger,
      now: () => now,
      setIntervalFn: (cb) => {
        tick = cb;
        return 1 as unknown as NodeJS.Timeout;
      },
      clearIntervalFn,
    });

    now = 100;
    tick?.();
    expect(logger).not.toHaveBeenCalled();

    now = 260;
    tick?.();
    expect(logger).toHaveBeenCalledTimes(1);
    expect(logger.mock.calls[0]?.[0]).toMatchObject({
      type: 'event-loop-lag',
      lagMs: 60,
      intervalMs: 100,
    });

    stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(1);
  });
});
