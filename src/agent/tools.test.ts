import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTools } from './tools.js';

let capturedToolHandler: ((name: string, args: unknown) => Promise<unknown>) | undefined;
let runMock: ReturnType<typeof vi.fn>;
let initMock: ReturnType<typeof vi.fn>;

vi.mock('./pyodide/client.js', () => ({
  createPythonClient: (opts?: { toolHandler?: (name: string, args: unknown) => Promise<unknown> }) => {
    capturedToolHandler = opts?.toolHandler;
    initMock = vi.fn().mockResolvedValue(undefined);
    return {
      init: initMock,
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
    expect(tools).toHaveProperty('get_stint_pace');
    expect(tools).toHaveProperty('compare_drivers');
    expect(tools).toHaveProperty('get_undercut_window');
    expect(tools).toHaveProperty('simulate_rejoin');
    expect(tools).toHaveProperty('get_position_changes');
    expect(tools).toHaveProperty('set_time_cursor');
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

    const result = await tools.get_topic_reference.execute({ topic: 'TimingData' } as any);
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

    const result = await tools.run_py.execute({ code: 'call_tool("run_py")' } as any);
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

    const result = await tools.run_py.execute({ code: '1+1', vars: bigVars } as any);
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

    const result = await tools.run_py.execute({ code: 'import asyncio\nasyncio.run(main())' } as any);
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

    const result = await tools.run_py.execute({ code: 'import micropip\nawait micropip.install(\"numpy\")' } as any);
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
