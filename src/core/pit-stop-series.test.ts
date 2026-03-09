import { describe, expect, it } from 'vitest';
import {
  buildPitStopSeriesState,
  getPitStopSeriesRecords,
  mergePitStopSeriesState,
} from './pit-stop-series.js';

describe('pit-stop-series', () => {
  it('normalizes array-shaped stop updates and merges them into keyed state', () => {
    const state = buildPitStopSeriesState({
      baseState: {
        Notes: 'strategy',
        PitTimes: {
          '4': [
            {
              Timestamp: '2025-01-01T00:12:30Z',
              PitStop: {
                RacingNumber: '4',
                Lap: '12',
                PitStopTime: '2.45',
              },
            },
          ],
        },
      },
      timeline: [
        {
          json: {
            PitTimes: {
              '4': {
                '1': {
                  Timestamp: '2025-01-01T00:15:30Z',
                  PitStop: {
                    RacingNumber: '4',
                    Lap: '15',
                    PitStopTime: '2.60',
                    PitLaneTime: '22.80',
                  },
                },
              },
            },
          },
        },
      ],
    });

    expect(state).toEqual({
      Notes: 'strategy',
      PitTimes: {
        '4': {
          '0': {
            Timestamp: '2025-01-01T00:12:30Z',
            PitStop: {
              RacingNumber: '4',
              Lap: '12',
              PitStopTime: '2.45',
            },
          },
          '1': {
            Timestamp: '2025-01-01T00:15:30Z',
            PitStop: {
              RacingNumber: '4',
              Lap: '15',
              PitStopTime: '2.60',
              PitLaneTime: '22.80',
            },
          },
        },
      },
    });
  });

  it('returns deterministic typed records with lap and duration parsing', () => {
    const records = getPitStopSeriesRecords({
      state: {
        PitTimes: {
          '81': {
            '0': {
              Timestamp: '2025-01-01T00:18:10Z',
              PitStop: {
                RacingNumber: '81',
                Lap: '18',
                PitStopTime: '3.10',
                PitLaneTime: '23.50',
              },
            },
          },
          '4': {
            '1': {
              Timestamp: '2025-01-01T00:15:30',
              PitStop: {
                RacingNumber: '4',
                Lap: '15',
                PitStopTime: '2.60',
                PitLaneTime: '22.80',
              },
            },
            '0': {
              Timestamp: '2025-01-01T00:12:30Z',
              PitStop: {
                RacingNumber: '4',
                Lap: '12',
                PitStopTime: '2.45',
                PitLaneTime: '22.10',
              },
            },
          },
        },
      },
      endLap: 15,
    });

    expect(records).toEqual([
      {
        driverNumber: '4',
        stopNumber: 0,
        lap: 12,
        timestamp: '2025-01-01T00:12:30Z',
        dateTime: new Date('2025-01-01T00:12:30Z'),
        pitStopTime: '2.45',
        pitStopTimeMs: 2450,
        pitLaneTime: '22.10',
        pitLaneTimeMs: 22100,
        raw: {
          Timestamp: '2025-01-01T00:12:30Z',
          PitStop: {
            RacingNumber: '4',
            Lap: '12',
            PitStopTime: '2.45',
            PitLaneTime: '22.10',
          },
        },
      },
      {
        driverNumber: '4',
        stopNumber: 1,
        lap: 15,
        timestamp: '2025-01-01T00:15:30',
        dateTime: new Date('2025-01-01T00:15:30.000Z'),
        pitStopTime: '2.60',
        pitStopTimeMs: 2600,
        pitLaneTime: '22.80',
        pitLaneTimeMs: 22800,
        raw: {
          Timestamp: '2025-01-01T00:15:30',
          PitStop: {
            RacingNumber: '4',
            Lap: '15',
            PitStopTime: '2.60',
            PitLaneTime: '22.80',
          },
        },
      },
    ]);
  });

  it('keeps prior state when a non-object patch is ignored', () => {
    const state = mergePitStopSeriesState(
      {
        PitTimes: {
          '4': {
            '0': {
              PitStop: { RacingNumber: '4', Lap: '12' },
            },
          },
        },
      },
      null,
    );

    expect(state).toEqual({
      PitTimes: {
        '4': {
          '0': {
            PitStop: { RacingNumber: '4', Lap: '12' },
          },
        },
      },
    });
  });
});
