import { describe, expect, it } from 'vitest';
import { getPitStopEventRecords } from './pit-stop-state.js';

describe('pit-stop-state', () => {
  it('builds deterministic pit stop events with tyre context from TyreStintSeries', () => {
    const events = getPitStopEventRecords({
      pitStopSeriesState: {
        PitTimes: {
          '4': {
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
      tyreStintSeriesState: {
        Stints: {
          '4': {
            '1': {
              Compound: 'MEDIUM',
              New: 'true',
              StartLaps: 1,
              TotalLaps: 12,
              LapNumber: 12,
            },
            '2': {
              Compound: 'HARD',
              New: 'false',
              StartLaps: 12,
              TotalLaps: 20,
              LapNumber: 13,
            },
          },
        },
      },
      timingDataState: {
        Lines: {
          '4': { Position: '1' },
        },
      },
    });

    expect(events).toEqual([
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
        tyreBefore: {
          stint: 1,
          compound: 'MEDIUM',
          isNew: true,
          tyresNotChanged: null,
          startLaps: 1,
          totalLaps: 12,
          lapsOnTyre: 11,
          lapNumber: 12,
          source: 'TyreStintSeries',
        },
        tyreAfter: {
          stint: 2,
          compound: 'HARD',
          isNew: false,
          tyresNotChanged: null,
          startLaps: 12,
          totalLaps: 20,
          lapsOnTyre: 8,
          lapNumber: 13,
          source: 'TyreStintSeries',
        },
        source: 'PitStopSeries',
      },
    ]);
  });

  it('falls back to TimingAppData tyre stints and filters by driver/lap', () => {
    const events = getPitStopEventRecords({
      driverNumber: '81',
      startLap: 20,
      endLap: 30,
      pitStopSeriesState: {
        PitTimes: {
          '4': {
            '0': {
              PitStop: { RacingNumber: '4', Lap: '14', PitStopTime: '2.70' },
            },
          },
          '81': {
            '0': {
              PitStop: {
                RacingNumber: '81',
                Lap: '24',
                PitStopTime: '3.10',
                PitLaneTime: '23.50',
              },
            },
          },
        },
      },
      timingAppDataState: {
        Lines: {
          '81': {
            Stints: {
              '1': {
                Compound: 'MEDIUM',
                New: 'true',
                StartLaps: 5,
                TotalLaps: 24,
                LapNumber: 24,
              },
              '2': {
                Compound: 'SOFT',
                New: 'true',
                StartLaps: 24,
                TotalLaps: 30,
                LapNumber: 25,
              },
            },
          },
        },
      },
      timingDataState: {
        Lines: {
          '81': { Position: '2' },
        },
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      driverNumber: '81',
      lap: 24,
      pitStopTimeMs: 3100,
      pitLaneTimeMs: 23500,
      tyreBefore: { compound: 'MEDIUM', source: 'TimingAppData' },
      tyreAfter: { compound: 'SOFT', source: 'TimingAppData' },
    });
  });
});
