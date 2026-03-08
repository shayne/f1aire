import { describe, expect, it } from 'vitest';
import { createAnalysisContext } from './analysis.js';

describe('createAnalysisContext.getTopicStats', () => {
  it('returns canonical topic names (e.g. CarData instead of CarData.z)', () => {
    const store = {
      raw: {
        subscribe: {},
        download: null,
        live: [
          {
            type: 'CarData.z',
            json: 'abc',
            dateTime: new Date('2024-01-01T00:00:01Z'),
          },
          {
            type: 'CarData.z',
            json: 'def',
            dateTime: new Date('2024-01-01T00:00:02Z'),
          },
          {
            type: 'Position.z',
            json: 'xyz',
            dateTime: new Date('2024-01-01T00:00:03Z'),
          },
          {
            type: 'TimingData',
            json: { Lines: {} },
            dateTime: new Date('2024-01-01T00:00:04Z'),
          },
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

describe('createAnalysisContext.getLapTable', () => {
  it('projects replay stint context from TyreStintSeries/TimingAppData helpers', () => {
    const store = {
      raw: {
        subscribe: {},
        download: null,
        live: [],
      },
      topic: () => ({ latest: null, timeline: () => [] }),
    } as any;

    const analysis = createAnalysisContext({
      store,
      processors: {
        timingData: {
          state: { Lines: { '4': { Line: 1 } } },
          getLapNumbers: () => [12],
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2024-01-01T00:12:00Z'),
                    Line: 1,
                    NumberOfLaps: 12,
                    LastLapTime: { Value: '1:30.000' },
                    GapToLeader: '0',
                  },
                ],
              ]),
            ],
          ]),
        },
        timingAppData: {
          state: {
            Lines: {
              '4': {
                Stints: {
                  '0': {
                    Compound: 'MEDIUM',
                    New: 'true',
                    StartLaps: 0,
                    TotalLaps: 20,
                  },
                },
              },
            },
          },
        },
      },
    } as any);

    expect(analysis.getLapTable({ includeStints: true })).toMatchObject([
      {
        lap: 12,
        driverNumber: '4',
        stint: {
          driverNumber: '4',
          stint: 0,
          compound: 'MEDIUM',
          isNew: true,
          startLaps: 0,
          totalLaps: 12,
          lapsOnTyre: 12,
          source: 'TimingAppData',
        },
      },
    ]);
  });
});
