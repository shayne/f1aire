import { describe, expect, it } from 'vitest';
import { createAnalysisContext } from './analysis.js';

describe('createAnalysisContext.getTopicStats', () => {
  it('returns canonical topic names (e.g. CarData instead of CarData.z)', () => {
    const store = {
      raw: {
        subscribe: {},
        download: null,
        live: [
          { type: 'CarData.z', json: 'abc', dateTime: new Date('2024-01-01T00:00:01Z') },
          { type: 'CarData.z', json: 'def', dateTime: new Date('2024-01-01T00:00:02Z') },
          { type: 'Position.z', json: 'xyz', dateTime: new Date('2024-01-01T00:00:03Z') },
          { type: 'TimingData', json: { Lines: {} }, dateTime: new Date('2024-01-01T00:00:04Z') },
        ],
      },
      topic: () => ({ latest: null, timeline: () => [] }),
    } as any;

    const analysis = createAnalysisContext({ store, processors: {} as any });
    const stats = analysis.getTopicStats();

    expect(stats.find((x: any) => x.topic === 'CarData')).toMatchObject({
      topic: 'CarData',
      streamNames: ['CarData.z'],
      count: 2,
    });
    expect(stats.find((x: any) => x.topic === 'Position')).toMatchObject({
      topic: 'Position',
      streamNames: ['Position.z'],
      count: 1,
    });
    expect(stats.find((x: any) => x.topic === 'CarData.z')).toBeUndefined();
  });
});

