import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTools } from './tools.js';

let capturedToolHandler: ((name: string, args: unknown) => Promise<unknown>) | undefined;

vi.mock('./pyodide/client.js', () => ({
  createPythonClient: (opts?: { toolHandler?: (name: string, args: unknown) => Promise<unknown> }) => {
    capturedToolHandler = opts?.toolHandler;
    return {
      init: vi.fn(),
      run: vi.fn(),
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
});
