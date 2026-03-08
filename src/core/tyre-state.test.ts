import { describe, expect, it } from 'vitest';
import { getCurrentTyreRecords, getTyreStintRecords } from './tyre-state.js';

describe('tyre-state', () => {
  it('prefers TyreStintSeries over TimingAppData and keeps timing order', () => {
    const records = getTyreStintRecords({
      timingDataState: {
        Lines: {
          '4': { Position: '1' },
          '81': { Position: '2' },
        },
      },
      tyreStintSeriesState: {
        Stints: {
          '4': {
            '1': {
              Compound: 'MEDIUM',
              New: 'true',
              TyresNotChanged: '0',
              StartLaps: 12,
              TotalLaps: 14,
              LapNumber: 14,
            },
          },
        },
      },
      timingAppDataState: {
        Lines: {
          '4': {
            Stints: {
              '0': {
                Compound: 'SOFT',
                New: 'false',
                StartLaps: 3,
                TotalLaps: 3,
              },
            },
          },
          '81': {
            Stints: {
              '0': {
                Compound: 'HARD',
                New: 'true',
                StartLaps: 0,
                TotalLaps: 10,
                LapTime: '1:33.000',
                LapNumber: 10,
              },
            },
          },
        },
      },
    });

    expect(records).toEqual([
      {
        driverNumber: '4',
        stint: 1,
        compound: 'MEDIUM',
        isNew: true,
        tyresNotChanged: false,
        startLaps: 12,
        totalLaps: 14,
        lapsOnTyre: 2,
        lapTime: null,
        lapNumber: 14,
        source: 'TyreStintSeries',
      },
      {
        driverNumber: '81',
        stint: 0,
        compound: 'HARD',
        isNew: true,
        tyresNotChanged: null,
        startLaps: 0,
        totalLaps: 10,
        lapsOnTyre: 10,
        lapTime: '1:33.000',
        lapNumber: 10,
        source: 'TimingAppData',
      },
    ]);
  });

  it('builds current tyre view from CurrentTyres with stint fallback metadata', () => {
    const records = getCurrentTyreRecords({
      currentTyresState: {
        Tyres: {
          '81': { Compound: 'HARD', New: 'false' },
        },
      },
      tyreStintSeriesState: {
        Stints: {
          '4': {
            '1': {
              Compound: 'MEDIUM',
              New: 'true',
              TyresNotChanged: '0',
              StartLaps: 12,
              TotalLaps: 14,
            },
          },
        },
      },
      timingAppDataState: {
        Lines: {
          '81': {
            Stints: {
              '0': {
                Compound: 'SOFT',
                New: 'true',
                StartLaps: 3,
                TotalLaps: 12,
              },
            },
          },
        },
      },
      timingDataState: {
        Lines: {
          '4': { Line: 1 },
          '81': { Line: 2 },
        },
      },
    });

    expect(records).toEqual([
      {
        driverNumber: '4',
        position: 1,
        compound: 'MEDIUM',
        isNew: true,
        tyresNotChanged: false,
        stint: 1,
        startLaps: 12,
        totalLaps: 14,
        lapsOnTyre: 2,
        source: 'TyreStintSeries',
      },
      {
        driverNumber: '81',
        position: 2,
        compound: 'HARD',
        isNew: false,
        tyresNotChanged: null,
        stint: 0,
        startLaps: 3,
        totalLaps: 12,
        lapsOnTyre: 9,
        source: 'CurrentTyres',
      },
    ]);
  });
});
