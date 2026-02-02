import { describe, expect, it } from 'vitest';
import { TimingService } from './timing-service.js';
import { buildAnalysisIndex } from './analysis-index.js';
import type { SessionStore } from './session-store.js';

const makeStore = (live: any[]): SessionStore => {
  const byType = new Map<string, any[]>();
  for (const point of live) {
    const arr = byType.get(point.type) ?? [];
    arr.push(point);
    byType.set(point.type, arr);
  }
  return {
    raw: { subscribe: {}, live },
    topic: (name: string) => ({
      latest: (byType.get(name) ?? []).slice(-1)[0] ?? null,
      timeline: () => byType.get(name) ?? [],
    }),
  } as SessionStore;
};

describe('buildAnalysisIndex', () => {
  it('builds lap records and resolves as-of laps', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': {
              NumberOfLaps: 1,
              Position: '1',
              LapTime: { Value: '1:30.000' },
              GapToLeader: '0',
            },
            '2': {
              NumberOfLaps: 1,
              Position: '2',
              LapTime: { Value: '1:31.000' },
              GapToLeader: '+1.2',
              IntervalToPositionAhead: { Value: '+1.2' },
            },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': {
              NumberOfLaps: 2,
              Position: '1',
              LapTime: { Value: '1:30.500' },
              GapToLeader: '0',
            },
            '2': {
              NumberOfLaps: 2,
              Position: '2',
              LapTime: { Value: '1:31.200' },
              GapToLeader: '+1.6',
              IntervalToPositionAhead: { Value: '+1.6' },
            },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const store = makeStore(live);
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ store, processors: timing.processors });

    expect(index.lapNumbers).toEqual([1, 2]);
    expect(index.byDriver.get('1')?.length).toBe(2);
    expect(index.byDriver.get('2')?.[0]?.lapTimeMs).toBe(91_000);

    const resolved = index.resolveAsOf({ lap: 2 });
    expect(resolved.lap).toBe(2);
  });
});
