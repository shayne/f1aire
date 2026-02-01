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
  it('exposes run_js tool', () => {
    const tools = makeTools({ store, processors });
    expect(tools).toHaveProperty('run_js');
  });
});
