import { describe, it, expect } from 'vitest';
import { makeTools } from './tools.js';

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
});
