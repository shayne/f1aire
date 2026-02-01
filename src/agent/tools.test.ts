import { describe, expect, it, vi } from 'vitest';

vi.mock('ai', () => ({
  tool: (config: any) => ({ ...config, __tool: true }),
}));

vi.mock('zod', () => {
  const withOptional = (value: Record<string, unknown>) =>
    Object.assign(value, { optional: () => ({ ...value, optional: true }) });
  const string = () => {
    const base: any = { _type: 'string' };
    base.min = (min: number) => withOptional({ _type: 'string', min });
    return withOptional(base);
  };
  return {
    z: {
      object: (shape: Record<string, unknown>) => ({ _type: 'object', shape }),
      string,
    },
  };
});

describe('engineer tools', () => {
  it('wires tool wrappers to store, processors, and runJs', async () => {
    const { createEngineerTools } = await import('./tools.js');
    const { engineerJsSkill } = await import('./prompt.js');

    const store = {
      topic: (name: string) => {
        if (name === 'TimingData') return { latest: { Lines: { '44': { GapToLeader: '+1.2' } } } };
        return undefined;
      },
    };

    const processors = {
      timingData: {
        latest: { Lines: { '44': { GapToLeader: '+1.2' } } },
        lapTimes: { '44': [{ lap: 1, time: '1:30.000' }] },
        snapshot: (ts?: string) => ({ ts, sample: true }),
      },
      timingAppData: {
        stints: { '44': [{ Compound: 'SOFT', TotalLaps: 12 }] },
      },
      driverList: {
        latest: { '44': { FullName: 'Lewis Hamilton' } },
      },
    };

    const runJs = vi.fn(async (code: string) => ({ ok: true, code }));

    const tools = createEngineerTools({ store, processors, runJs });

    expect(tools.get_latest.__tool).toBe(true);
    const latest = await tools.get_latest.execute({ topic: 'TimingData' });
    expect(latest).toEqual({ ok: true, data: { Lines: { '44': { GapToLeader: '+1.2' } } } });

    const driverList = await tools.get_driver_list.execute({});
    expect(driverList).toEqual({ ok: true, data: { '44': { FullName: 'Lewis Hamilton' } } });

    const driver = await tools.get_driver.execute({ driverNumber: '44' });
    expect(driver).toEqual({ ok: true, data: { FullName: 'Lewis Hamilton' } });

    const laps = await tools.get_lap_times.execute({ driverNumber: '44' });
    expect(laps).toEqual({ ok: true, data: [{ lap: 1, time: '1:30.000' }] });

    const stints = await tools.get_stints.execute({ driverNumber: '44' });
    expect(stints).toEqual({ ok: true, data: [{ Compound: 'SOFT', TotalLaps: 12 }] });

    const snapshot = await tools.get_timing_snapshot.execute({ ts: '00:01:00.000' });
    expect(snapshot).toEqual({ ok: true, data: { ts: '00:01:00.000', sample: true } });

    const jsResult = await tools.run_js.execute({ code: 'return 1 + 1;' });
    expect(jsResult).toEqual({ ok: true, data: { ok: true, code: 'return 1 + 1;' } });
    expect(runJs).toHaveBeenCalledWith('return 1 + 1;');

    expect(tools.run_js.description).toContain(engineerJsSkill);
  });

  it('returns structured errors when data is missing', async () => {
    const { createEngineerTools } = await import('./tools.js');
    const store = { topic: (_name: string) => undefined };
    const processors = {};
    const runJs = vi.fn(async () => ({ ok: true }));

    const tools = createEngineerTools({ store, processors, runJs });

    const latest = await tools.get_latest.execute({ topic: 'TimingData' });
    expect(latest.ok).toBe(false);

    const driver = await tools.get_driver.execute({ driverNumber: '99' });
    expect(driver.ok).toBe(false);
  });
});
