import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTools } from './tools.js';

let capturedToolHandler: ((name: string, args: unknown) => Promise<unknown>) | undefined;
let runMock: ReturnType<typeof vi.fn>;

vi.mock('./pyodide/client.js', () => ({
  createPythonClient: (opts?: { toolHandler?: (name: string, args: unknown) => Promise<unknown> }) => {
    capturedToolHandler = opts?.toolHandler;
    return {
      init: vi.fn(),
      run: (...args: Parameters<NonNullable<typeof runMock>>) => runMock(...args),
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
  });

  it('exposes expected tools', () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(tools).toHaveProperty('get_stint_pace');
    expect(tools).toHaveProperty('compare_drivers');
    expect(tools).toHaveProperty('get_undercut_window');
    expect(tools).toHaveProperty('simulate_rejoin');
    expect(tools).toHaveProperty('get_position_changes');
    expect(tools).toHaveProperty('set_time_cursor');
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

    await expect(
      tools.run_py.execute({ code: 'call_tool("run_py")' } as any),
    ).rejects.toThrow(/run_py is not callable from Python/i);
  });

  it('python tool handler rejects run_py and parses input', async () => {
    makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(capturedToolHandler).toBeTypeOf('function');
    await expect(capturedToolHandler?.('run_py', {})).rejects.toThrow(/run_py/i);
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

    await expect(
      tools.run_py.execute({ code: '1+1', vars: bigVars } as any),
    ).rejects.toThrow(/vars payload too large/i);
  });

  it('rejects asyncio.run in run_py code', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.run_py.execute({ code: 'import asyncio\nasyncio.run(main())' } as any),
    ).rejects.toThrow(/asyncio\.run/i);
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
});
