import { describe, expect, it } from 'vitest';
import { PitStopSeriesProcessor } from './pit-stop-series.js';

describe('PitStopSeriesProcessor', () => {
  it('merges stop patches and exposes typed stop queries', () => {
    const processor = new PitStopSeriesProcessor();

    processor.process({
      type: 'PitStopSeries',
      json: {
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
      dateTime: new Date('2025-01-01T00:12:30Z'),
    });
    processor.process({
      type: 'PitStopSeries',
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
      dateTime: new Date('2025-01-01T00:15:30Z'),
    });

    expect(processor.state).toEqual({
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

    expect(
      processor.getStops({ driverNumber: '4', order: 'desc', limit: 1 }),
    ).toEqual([
      {
        driverNumber: '4',
        stopNumber: 1,
        lap: 15,
        timestamp: '2025-01-01T00:15:30Z',
        dateTime: new Date('2025-01-01T00:15:30Z'),
        pitStopTime: '2.60',
        pitStopTimeMs: 2600,
        pitLaneTime: '22.80',
        pitLaneTimeMs: 22800,
        raw: {
          Timestamp: '2025-01-01T00:15:30Z',
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
});
