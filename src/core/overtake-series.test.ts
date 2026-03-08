import { describe, expect, it } from 'vitest';
import {
  getOvertakeSeriesRecords,
  summarizeOvertakeSeries,
} from './overtake-series.js';

describe('getOvertakeSeriesRecords', () => {
  const state = {
    Overtakes: {
      '4': [
        { Timestamp: '2025-01-01T00:01:10Z', count: 1 },
        { Timestamp: '2025-01-01T00:02:20Z', count: '2' },
      ],
      '81': {
        '1': { Timestamp: '2025-01-01T00:01:30', Count: 3 },
        '2': { Timestamp: '2025-01-01T00:03:00Z', count: 5 },
      },
    },
  };

  it('builds typed overtake-series records from array and indexed shapes', () => {
    expect(getOvertakeSeriesRecords({ overtakeSeriesState: state })).toEqual([
      {
        driverNumber: '4',
        sequence: 0,
        timestamp: '2025-01-01T00:01:10Z',
        dateTime: new Date('2025-01-01T00:01:10Z'),
        count: 1,
        source: 'OvertakeSeries',
      },
      {
        driverNumber: '4',
        sequence: 1,
        timestamp: '2025-01-01T00:02:20Z',
        dateTime: new Date('2025-01-01T00:02:20Z'),
        count: 2,
        source: 'OvertakeSeries',
      },
      {
        driverNumber: '81',
        sequence: 1,
        timestamp: '2025-01-01T00:01:30',
        dateTime: new Date('2025-01-01T00:01:30Z'),
        count: 3,
        source: 'OvertakeSeries',
      },
      {
        driverNumber: '81',
        sequence: 2,
        timestamp: '2025-01-01T00:03:00Z',
        dateTime: new Date('2025-01-01T00:03:00Z'),
        count: 5,
        source: 'OvertakeSeries',
      },
    ]);
  });

  it('filters by driver and end time', () => {
    expect(
      getOvertakeSeriesRecords({
        overtakeSeriesState: state,
        driverNumber: '81',
        endTime: '2025-01-01T00:02:00Z',
      }),
    ).toEqual([
      {
        driverNumber: '81',
        sequence: 1,
        timestamp: '2025-01-01T00:01:30',
        dateTime: new Date('2025-01-01T00:01:30Z'),
        count: 3,
        source: 'OvertakeSeries',
      },
    ]);
  });
});

describe('summarizeOvertakeSeries', () => {
  it('summarizes per-driver series without over-interpreting the count field', () => {
    const summary = summarizeOvertakeSeries([
      {
        driverNumber: '4',
        sequence: 0,
        timestamp: '2025-01-01T00:01:10Z',
        dateTime: new Date('2025-01-01T00:01:10Z'),
        count: 1,
        source: 'OvertakeSeries',
      },
      {
        driverNumber: '4',
        sequence: 1,
        timestamp: '2025-01-01T00:02:20Z',
        dateTime: new Date('2025-01-01T00:02:20Z'),
        count: 2,
        source: 'OvertakeSeries',
      },
      {
        driverNumber: '4',
        sequence: 2,
        timestamp: '2025-01-01T00:03:30Z',
        dateTime: new Date('2025-01-01T00:03:30Z'),
        count: 2,
        source: 'OvertakeSeries',
      },
    ]);

    expect(summary).toEqual({
      driverNumber: '4',
      totalEntries: 3,
      firstTimestamp: '2025-01-01T00:01:10Z',
      lastTimestamp: '2025-01-01T00:03:30Z',
      latestCount: 2,
      minCount: 1,
      maxCount: 2,
      changes: 1,
    });
  });
});
