import { describe, expect, it } from 'vitest';
import {
  buildDriverRaceInfoState,
  getDriverRaceInfoRows,
  mergeDriverRaceInfoState,
} from './driver-race-info.js';

describe('driver race info helpers', () => {
  it('merges incremental driver patches into stable state', () => {
    const first = mergeDriverRaceInfoState(null, {
      '81': { Position: '2', Gap: '+3.2', PitStops: 0 },
    });
    const second = mergeDriverRaceInfoState(first, {
      '81': { Interval: '+1.0', Catching: 1 },
      '4': { Position: '1', Gap: 'LEADER', Interval: 'LEADER', PitStops: '1' },
    });

    expect(second).toEqual({
      '4': {
        Position: '1',
        Gap: 'LEADER',
        Interval: 'LEADER',
        PitStops: '1',
      },
      '81': {
        Position: '2',
        Gap: '+3.2',
        Interval: '+1.0',
        PitStops: 0,
        Catching: 1,
      },
    });
  });

  it('builds cursor-ready state from subscribe baseline and timeline patches', () => {
    const state = buildDriverRaceInfoState({
      baseState: {
        '4': { Position: '1', Gap: 'LEADER', Interval: 'LEADER', PitStops: 0 },
      },
      timeline: [
        {
          json: {
            '81': { Position: '2', Gap: '+2.5', Interval: '+2.5', PitStops: 0 },
          },
        },
        {
          json: {
            '4': { Catching: false },
            '81': { Catching: true, OvertakeState: 2 },
          },
        },
      ],
    });

    expect(state).toEqual({
      '4': {
        Position: '1',
        Gap: 'LEADER',
        Interval: 'LEADER',
        PitStops: 0,
        Catching: false,
      },
      '81': {
        Position: '2',
        Gap: '+2.5',
        Interval: '+2.5',
        PitStops: 0,
        Catching: true,
        OvertakeState: 2,
      },
    });
  });

  it('returns ordered typed rows with parsed numeric fields', () => {
    const rows = getDriverRaceInfoRows({
      state: {
        '81': {
          Position: '2',
          Gap: '+3.200',
          Interval: '+1.100',
          PitStops: '0',
          Catching: 1,
          OvertakeState: false,
        },
        '4': {
          Position: '1',
          Gap: 'LEADER',
          Interval: 'LEADER',
          PitStops: 1,
          Catching: false,
          OvertakeState: 0,
        },
      },
      driverListState: {
        '4': { FullName: 'Lando Norris' },
        '81': { BroadcastName: 'Oscar Piastri' },
      },
    });

    expect(rows).toEqual([
      {
        driverNumber: '4',
        driverName: 'Lando Norris',
        position: 1,
        gap: 'LEADER',
        gapSeconds: null,
        interval: 'LEADER',
        intervalSeconds: null,
        pitStops: 1,
        catching: false,
        overtakeState: 0,
        raw: {
          Position: '1',
          Gap: 'LEADER',
          Interval: 'LEADER',
          PitStops: 1,
          Catching: false,
          OvertakeState: 0,
        },
      },
      {
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        position: 2,
        gap: '+3.200',
        gapSeconds: 3.2,
        interval: '+1.100',
        intervalSeconds: 1.1,
        pitStops: 0,
        catching: 1,
        overtakeState: false,
        raw: {
          Position: '2',
          Gap: '+3.200',
          Interval: '+1.100',
          PitStops: '0',
          Catching: 1,
          OvertakeState: false,
        },
      },
    ]);
  });
});
