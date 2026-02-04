import { describe, it, expect } from 'vitest';
import { buildPythonContext } from './context.js';

describe('buildPythonContext', () => {
  it('omits functions so the context can be structured-cloned', () => {
    const store = {
      raw: { subscribe: { topic: 'TimingData' }, live: [{ type: 'X', json: {}, dateTime: new Date() }] },
      topic: () => ({
        latest: null,
        timeline: () => [],
      }),
    };
    const processors = {
      timingData: {
        state: { Lines: { '4': { Position: 1 } } },
        getLapHistory: () => [],
      },
      driverList: {
        state: { '4': { FullName: 'Lando Norris' } },
        getName: () => 'Lando Norris',
      },
      trackStatus: {
        state: { Status: '1', Message: 'Green' },
        getAt: () => ({ Status: '1', Message: 'Green' }),
      },
    };

    const context = buildPythonContext({ store: store as any, processors: processors as any });

    expect(context).toHaveProperty('raw');
    expect(context).toHaveProperty('processors');
    expect(() => structuredClone(context)).not.toThrow();
  });

  it('includes provided vars in the context', () => {
    const store = {
      raw: { subscribe: {}, live: [] },
      topic: () => ({ latest: null, timeline: () => [] }),
    };

    const context = buildPythonContext({
      store: store as any,
      processors: {} as any,
      vars: { rows: [{ lap: 1 }] },
    });

    expect(context.vars).toEqual({ rows: [{ lap: 1 }] });
    expect(() => structuredClone(context)).not.toThrow();
  });
});
