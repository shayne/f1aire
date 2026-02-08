import { describe, expect, it } from 'vitest';
import type { LapRecord } from './analysis-index.js';
import {
  classifyTrackPhase,
  classifyDrsChannel45,
  computeGapTrainsForLap,
  computePitLaneTimeStats,
  computeScVscDeltas,
  parseDurationMs,
} from './race-engineer-metrics.js';

function makeRecord(partial: Partial<LapRecord>): LapRecord {
  return {
    lap: 1,
    driverNumber: '1',
    dateTime: new Date('2024-01-01T00:00:00Z'),
    lapTimeMs: 90_000,
    gapToLeaderSec: null,
    intervalToAheadSec: null,
    position: 1,
    traffic: 'clean',
    trackStatus: { status: '1', message: 'AllClear', isGreen: true },
    flags: { pit: false, pitIn: false, pitOut: false, inPit: false },
    stint: null,
    ...partial,
  };
}

describe('classifyTrackPhase', () => {
  it('maps common status codes', () => {
    expect(classifyTrackPhase('1', 'AllClear')).toBe('green');
    expect(classifyTrackPhase('2', 'Yellow')).toBe('yellow');
    expect(classifyTrackPhase('4', 'Safety Car')).toBe('sc');
    expect(classifyTrackPhase('6', 'VSC Deployed')).toBe('vsc');
    expect(classifyTrackPhase('7', 'VSC Ending')).toBe('vsc');
    expect(classifyTrackPhase('5', 'Red Flag')).toBe('red');
  });

  it('falls back to message text', () => {
    expect(classifyTrackPhase(null, 'Virtual Safety Car')).toBe('vsc');
    expect(classifyTrackPhase(null, 'Safety Car Deployed')).toBe('sc');
    expect(classifyTrackPhase(null, 'AllClear')).toBe('green');
  });
});

describe('classifyDrsChannel45', () => {
  it('classifies common DRS codes', () => {
    expect(classifyDrsChannel45(0)).toEqual({ raw: 0, state: 'off' });
    expect(classifyDrsChannel45(1)).toEqual({ raw: 1, state: 'off' });
    expect(classifyDrsChannel45(8)).toEqual({ raw: 8, state: 'eligible' });
    expect(classifyDrsChannel45(10)).toEqual({ raw: 10, state: 'on' });
    expect(classifyDrsChannel45(12)).toEqual({ raw: 12, state: 'on' });
    expect(classifyDrsChannel45(14)).toEqual({ raw: 14, state: 'on' });
    expect(classifyDrsChannel45(2).state).toBe('unknown');
    expect(classifyDrsChannel45(null).raw).toBeNull();
  });
});

describe('computeGapTrainsForLap', () => {
  it('detects gap trains within threshold', () => {
    const lapRecords = new Map<string, LapRecord>([
      ['1', makeRecord({ driverNumber: '1', position: 1, intervalToAheadSec: null })],
      ['2', makeRecord({ driverNumber: '2', position: 2, intervalToAheadSec: 0.8 })],
      ['3', makeRecord({ driverNumber: '3', position: 3, intervalToAheadSec: 0.9 })],
      ['4', makeRecord({ driverNumber: '4', position: 4, intervalToAheadSec: 1.3 })],
    ]);

    const report = computeGapTrainsForLap({
      lap: 10,
      lapRecords,
      thresholdSec: 1.0,
      minCars: 3,
      requireGreen: true,
    });

    expect(report.skipped).toBe(false);
    expect(report.trains).toHaveLength(1);
    expect(report.trains[0]?.drivers.map((d) => d.driverNumber)).toEqual(['1', '2', '3']);
  });

  it('skips non-green laps when requireGreen is enabled', () => {
    const lapRecords = new Map<string, LapRecord>([
      [
        '1',
        makeRecord({
          driverNumber: '1',
          position: 1,
          trackStatus: { status: '4', message: 'Safety Car', isGreen: false },
        }),
      ],
      [
        '2',
        makeRecord({
          driverNumber: '2',
          position: 2,
          intervalToAheadSec: 0.5,
          trackStatus: { status: '4', message: 'Safety Car', isGreen: false },
        }),
      ],
      [
        '3',
        makeRecord({
          driverNumber: '3',
          position: 3,
          intervalToAheadSec: 0.5,
          trackStatus: { status: '4', message: 'Safety Car', isGreen: false },
        }),
      ],
    ]);

    const report = computeGapTrainsForLap({
      lap: 12,
      lapRecords,
      thresholdSec: 1.0,
      minCars: 2,
      requireGreen: true,
    });

    expect(report.skipped).toBe(true);
    expect(report.trains).toHaveLength(0);
  });
});

describe('computeScVscDeltas', () => {
  it('computes median deltas vs green for a driver', () => {
    const byLap = new Map<number, Map<string, LapRecord>>([
      [
        1,
        new Map([
          [
            '1',
            makeRecord({
              lap: 1,
              driverNumber: '1',
              lapTimeMs: 90_000,
              trackStatus: { status: '1', message: 'AllClear', isGreen: true },
            }),
          ],
        ]),
      ],
      [
        2,
        new Map([
          [
            '1',
            makeRecord({
              lap: 2,
              driverNumber: '1',
              lapTimeMs: 91_000,
              trackStatus: { status: '1', message: 'AllClear', isGreen: true },
            }),
          ],
        ]),
      ],
      [
        3,
        new Map([
          [
            '1',
            makeRecord({
              lap: 3,
              driverNumber: '1',
              lapTimeMs: 130_000,
              trackStatus: { status: '4', message: 'Safety Car', isGreen: false },
            }),
          ],
        ]),
      ],
      [
        4,
        new Map([
          [
            '1',
            makeRecord({
              lap: 4,
              driverNumber: '1',
              lapTimeMs: 110_000,
              trackStatus: { status: '6', message: 'VSC Deployed', isGreen: false },
            }),
          ],
        ]),
      ],
    ]);

    const report = computeScVscDeltas({
      byLap,
      startLap: 1,
      endLap: 4,
      driverNumber: '1',
    });

    expect(report.method).toBe('driver');
    expect(report.baseline?.medianLapMs).toBe(90_500);
    expect(report.phases.sc.deltaToGreenMs).toBe(39_500);
    expect(report.phases.vsc.deltaToGreenMs).toBe(19_500);
  });
});

describe('parseDurationMs', () => {
  it('parses seconds and mm:ss formats', () => {
    expect(parseDurationMs('22.123')).toBe(22_123);
    expect(parseDurationMs('0:22.123')).toBe(22_123);
    expect(parseDurationMs('1:02.345')).toBe(62_345);
    expect(parseDurationMs(20)).toBe(20_000);
  });
});

describe('computePitLaneTimeStats', () => {
  it('computes median pit lane time from PitTimesList', () => {
    const state = {
      PitTimesList: {
        '1': [{ Duration: '22.000', Lap: '5' }, { Duration: '21.000', Lap: '20' }],
        '2': [{ Duration: '23.000', Lap: '10' }],
      },
    };

    const stats = computePitLaneTimeStats({ state, method: 'median' });

    expect(stats.samples).toBe(3);
    expect(stats.pitLaneTimeMs).toBe(22_000);
    expect(stats.byDriver.find((d) => d.driverNumber === '1')?.pitLaneTimeMs).toBe(21_500);
  });
});
