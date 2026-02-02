import { describe, expect, it } from 'vitest';
import { TimingService } from './timing-service.js';
import { buildAnalysisIndex } from './analysis-index.js';

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
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ processors: timing.processors });

    expect(index.lapNumbers).toEqual([1, 2]);
    expect(index.byDriver.get('1')?.length).toBe(2);
    expect(index.byDriver.get('2')?.[0]?.lapTimeMs).toBe(91_000);

    const resolved = index.resolveAsOf({ lap: 2 });
    expect(resolved.lap).toBe(2);
  });

  it('classifies traffic from behind using following interval', () => {
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
              LapTime: { Value: '1:30.200' },
              GapToLeader: '+3.0',
              IntervalToPositionAhead: { Value: '+3.0' },
            },
            '3': {
              NumberOfLaps: 1,
              Position: '3',
              LapTime: { Value: '1:30.400' },
              GapToLeader: '+3.4',
              IntervalToPositionAhead: { Value: '+0.4' },
            },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
    ];

    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ processors: timing.processors });
    const record = index.byDriver.get('2')?.[0];

    expect(record?.traffic).toBe('traffic');
  });

  it('derives pit events and position changes', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 1, Position: '1', LapTime: { Value: '1:30.000' } },
            '2': { NumberOfLaps: 1, Position: '2', LapTime: { Value: '1:31.000' } },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 2, Position: '2', LapTime: { Value: '1:32.000' }, PitIn: true },
            '2': { NumberOfLaps: 2, Position: '1', LapTime: { Value: '1:30.500' } },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ processors: timing.processors });

    expect(index.getPitEvents().length).toBe(1);
    expect(index.getPositionChanges().length).toBe(2);
  });
});
