import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTools } from './tools.js';

let capturedToolHandler:
  | ((name: string, args: unknown) => Promise<unknown>)
  | undefined;
let runMock: ReturnType<typeof vi.fn>;
let initMock: ReturnType<typeof vi.fn>;

vi.mock('./pyodide/client.js', () => ({
  createPythonClient: (opts?: {
    toolHandler?: (name: string, args: unknown) => Promise<unknown>;
  }) => {
    capturedToolHandler = opts?.toolHandler;
    initMock = vi.fn().mockResolvedValue(undefined);
    return {
      init: initMock,
      run: (...args: Parameters<NonNullable<typeof runMock>>) =>
        runMock(...args),
      shutdown: vi.fn(),
    };
  },
}));

const store = {
  topic: () => ({
    latest: { type: 'TimingData', json: { Lines: {} }, dateTime: new Date() },
  }),
  raw: { subscribe: {}, live: [] },
} as any;
const processors = {
  timingData: { bestLaps: new Map(), getLapHistory: () => [], state: {} },
  driverList: { state: {} },
} as any;

describe('tools', () => {
  beforeEach(() => {
    capturedToolHandler = undefined;
    runMock = vi.fn().mockResolvedValue({ ok: true, value: null });
    initMock?.mockClear?.();
  });

  it('exposes expected tools', () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(tools).toHaveProperty('get_data_book_index');
    expect(tools).toHaveProperty('get_topic_reference');
    expect(tools).toHaveProperty('get_download_manifest');
    expect(tools).toHaveProperty('get_keyframe');
    expect(tools).toHaveProperty('get_stint_pace');
    expect(tools).toHaveProperty('compare_drivers');
    expect(tools).toHaveProperty('get_undercut_window');
    expect(tools).toHaveProperty('simulate_rejoin');
    expect(tools).toHaveProperty('get_drs_state');
    expect(tools).toHaveProperty('get_drs_usage');
    expect(tools).toHaveProperty('get_drs_trains');
    expect(tools).toHaveProperty('get_sc_vsc_deltas');
    expect(tools).toHaveProperty('get_pit_loss_estimate');
    expect(tools).toHaveProperty('get_position_changes');
    expect(tools).toHaveProperty('get_team_radio_events');
    expect(tools).toHaveProperty('set_time_cursor');
  });

  it('get_team_radio_events resolves newest clips with absolute asset URLs', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: {
            SessionInfo: {
              Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4'
              ? 'Lando Norris'
              : driverNumber === '81'
                ? 'Oscar Piastri'
                : null,
        },
        teamRadio: {
          state: {
            Captures: {
              '0': {
                Utc: '2024-05-26T12:15:25.710Z',
                RacingNumber: '81',
                Path: 'TeamRadio/OSCPIA01_81_20240526_121525.mp3',
              },
              '1': {
                Utc: '2024-05-26T12:16:25.710Z',
                RacingNumber: '4',
                Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_team_radio_events.execute({
      limit: 1,
    } as any);

    expect(result).toMatchObject({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
      total: 2,
      returned: 1,
      captures: [
        {
          captureId: '1',
          driverNumber: '4',
          driverName: 'Lando Norris',
          assetUrl:
            'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/TeamRadio/LANNOR01_4_20240526_121625.mp3',
        },
      ],
    });
  });

  it('get_extrapolated_clock projects remaining time at the current cursor', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        timingData: {
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [10],
          driversByLap: new Map([
            [
              10,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:00:30Z') }],
              ]),
            ],
          ]),
          state: {},
        },
        extrapolatedClock: {
          state: {
            Utc: '2025-01-01T12:00:00Z',
            Remaining: '00:10:00',
            Extrapolating: true,
          },
          getRemainingAt: (dateTime?: Date | null) => {
            const referenceTime = dateTime ?? new Date('2025-01-01T12:00:00Z');
            const elapsedMs = Math.max(
              0,
              referenceTime.getTime() -
                new Date('2025-01-01T12:00:00Z').getTime(),
            );
            return {
              state: {
                Utc: '2025-01-01T12:00:00Z',
                Remaining: '00:10:00',
                Extrapolating: true,
              },
              sourceTime: new Date('2025-01-01T12:00:00Z'),
              referenceTime,
              remainingMs: 600_000 - elapsedMs,
              remainingSeconds: (600_000 - elapsedMs) / 1_000,
              extrapolating: true,
              expired: false,
            };
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_extrapolated_clock.execute({} as any);

    expect(result).toMatchObject({
      asOf: { lap: 10, dateTime: new Date('2025-01-01T12:00:30Z') },
      clock: {
        Utc: '2025-01-01T12:00:00Z',
        Remaining: '00:10:00',
        Extrapolating: true,
      },
      sourceTime: new Date('2025-01-01T12:00:00Z'),
      remainingMs: 570_000,
      remainingSeconds: 570,
      extrapolating: true,
      expired: false,
    });
  });

  it('get_latest returns merged state for auxiliary patch topics', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (name: string) => {
          if (name === 'CurrentTyres') {
            return {
              latest: {
                type: 'CurrentTyres',
                json: { Tyres: { '4': { Compound: 'MEDIUM', New: false } } },
                dateTime: new Date('2025-01-01T00:00:02Z'),
              },
              timeline: () => [],
            };
          }
          return { latest: null, timeline: () => [] };
        },
      } as any,
      processors: {
        ...processors,
        extraTopics: {
          CurrentTyres: {
            state: {
              Tyres: {
                '1': { Compound: 'SOFT', New: true },
                '4': { Compound: 'MEDIUM', New: false },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_latest.execute({
      topic: 'CurrentTyres',
    } as any);

    expect(result).toMatchObject({
      type: 'CurrentTyres',
      json: {
        Tyres: {
          '1': { Compound: 'SOFT', New: true },
          '4': { Compound: 'MEDIUM', New: false },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });
  });

  it('get_data_book_index returns entries', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const index = await tools.get_data_book_index.execute({} as any);
    expect(Array.isArray(index)).toBe(true);
    expect(index.find((x: any) => x?.topic === 'TimingData')).toBeTruthy();
  });

  it('get_topic_reference returns DataBook info for known topics', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'TimingData',
    } as any);
    expect(result).toMatchObject({
      found: true,
      canonicalTopic: 'TimingData',
      present: true,
    });
    expect(result.reference).toMatchObject({ topic: 'TimingData' });
  });

  it('run_py schema can be converted to JSON schema', () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(() => tools.run_py.inputSchema.toJSONSchema()).not.toThrow();
  });

  it('tool handler rejects run_py from python', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock.mockResolvedValueOnce({
      ok: false,
      error: 'run_py is not callable from Python',
    });

    const result = await tools.run_py.execute({
      code: 'call_tool("run_py")',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/run_py is not callable from Python/i),
    });
  });

  it('returns an error object instead of throwing when python runtime fails', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock.mockResolvedValueOnce({
      ok: false,
      error: 'Traceback (most recent call last):\nRuntimeError: boom',
    });

    const result = await tools.run_py.execute({ code: '1+1' } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/RuntimeError: boom/i),
    });
  });

  it('python tool handler rejects run_py and parses input', async () => {
    makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(capturedToolHandler).toBeTypeOf('function');
    await expect(capturedToolHandler?.('run_py', {})).rejects.toThrow(
      /run_py/i,
    );
    await expect(
      capturedToolHandler?.('get_latest', { topic: 123 }),
    ).rejects.toThrow(/expected string/i);
  });

  it('rejects large vars payloads for run_py', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const bigVars = { payload: 'x'.repeat(9000) };

    const result = await tools.run_py.execute({
      code: '1+1',
      vars: bigVars,
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/vars payload too large/i),
    });
  });

  it('rejects asyncio.run in run_py code', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.run_py.execute({
      code: 'import asyncio\nasyncio.run(main())',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/asyncio\.run/i),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects micropip.install in run_py code', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.run_py.execute({
      code: 'import micropip\nawait micropip.install(\"numpy\")',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/micropip\.install/i),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('passes only vars into the python context (no raw/processors)', async () => {
    const noisyStore = {
      ...store,
      raw: {
        ...store.raw,
        // Real SessionStore.raw contains functions and other non-cloneable values.
        subscribe: () => {},
      },
    } as any;

    const tools = makeTools({
      store: noisyStore,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await tools.run_py.execute({ code: '1+1', vars: { driver: '4' } } as any);

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '1+1',
        context: { vars: { driver: '4' } },
      }),
    );
  });

  it('re-initializes and retries once if the worker reports uninitialized', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock
      .mockResolvedValueOnce({ ok: false, error: 'pyodide is not initialized' })
      .mockResolvedValueOnce({ ok: true, value: 2 });

    const result = await tools.run_py.execute({ code: '1+1' } as any);

    expect(result).toEqual({ ok: true, value: 2 });
    expect(initMock).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});
