import { describe, expect, it } from 'vitest';
import { parseLapTimeMs, summarizeFromLines } from './summary.js';

const lines = [
  JSON.stringify({ type: 'DriverList', json: { '1': { FullName: 'Max TEST' } }, dateTime: '2024-01-01T00:00:00.000Z' }),
  JSON.stringify({ type: 'TimingData', json: { Lines: { '1': { Position: '1', BestLapTime: { Value: '1:30.000', Lap: 12 }, NumberOfLaps: 57 } } }, dateTime: '2024-01-01T00:01:00.000Z' }),
  JSON.stringify({ type: 'LapCount', json: { TotalLaps: 57 }, dateTime: '2024-01-01T00:01:01.000Z' }),
].join('\n');

describe('summarizeFromLines', () => {
  it('derives winner, fastest lap, total laps', () => {
    const summary = summarizeFromLines(lines);
    expect(summary.winner?.name).toBe('Max TEST');
    expect(summary.fastestLap?.time).toBe('1:30.000');
    expect(summary.totalLaps).toBe(57);
  });

  it('ignores invalid JSON lines', () => {
    const raw = [
      JSON.stringify({ type: 'DriverList', json: { '1': { FullName: 'Ada Lovelace' } }, dateTime: '2024-01-01T00:00:00.000Z' }),
      '{not-json',
      JSON.stringify({ type: 'TimingData', json: { Lines: { '1': { Position: '1', BestLapTime: { Value: '1:30.000', Lap: 3 } } } }, dateTime: '2024-01-01T00:00:10.000Z' }),
    ].join('\n');

    const summary = summarizeFromLines(raw);

    expect(summary.winner?.name).toBe('Ada Lovelace');
    expect(summary.fastestLap?.time).toBe('1:30.000');
  });

  it('non-numeric positions do not beat numeric leader', () => {
    const raw = [
      JSON.stringify({ type: 'DriverList', json: { '1': { FullName: 'Max TEST' }, '2': { FullName: 'No Position' } }, dateTime: '2024-01-01T00:00:00.000Z' }),
      JSON.stringify({
        type: 'TimingData',
        json: {
          Lines: {
            '1': { Position: '1', BestLapTime: { Value: '1:30.000', Lap: 12 } },
            '2': { Position: '', BestLapTime: { Value: '1:31.000', Lap: 5 } },
          },
        },
        dateTime: '2024-01-01T00:01:00.000Z',
      }),
    ].join('\n');

    const summary = summarizeFromLines(raw);

    expect(summary.winner?.number).toBe('1');
  });

  it('treats DNS/abc positions as last place', () => {
    const raw = [
      JSON.stringify({
        type: 'DriverList',
        json: { '1': { FullName: 'Max TEST' }, '2': { FullName: 'DNS Driver' }, '3': { FullName: 'ABC Driver' } },
        dateTime: '2024-01-01T00:00:00.000Z',
      }),
      JSON.stringify({
        type: 'TimingData',
        json: {
          Lines: {
            '1': { Position: '1', BestLapTime: { Value: '1:30.000', Lap: 12 } },
            '2': { Position: 'DNS', BestLapTime: { Value: '1:31.000', Lap: 5 } },
            '3': { Position: 'abc', BestLapTime: { Value: '1:32.000', Lap: 7 } },
          },
        },
        dateTime: '2024-01-01T00:01:00.000Z',
      }),
    ].join('\n');

    const summary = summarizeFromLines(raw);

    expect(summary.winner?.number).toBe('1');
  });

  it('merges incremental TimingData patches when deriving the winner', () => {
    const raw = [
      JSON.stringify({
        type: 'DriverList',
        json: { '4': { FullName: 'Lando NORRIS' }, '6': { FullName: 'Isack HADJAR' } },
        dateTime: '2024-01-01T00:00:00.000Z',
      }),
      JSON.stringify({
        type: 'TimingData',
        json: {
          Lines: {
            '4': { Position: '1', BestLapTime: { Value: '1:30.000' } },
            '6': { Position: '2', BestLapTime: { Value: '1:31.000' } },
          },
        },
        dateTime: '2024-01-01T00:00:10.000Z',
      }),
      // Late patch does not include the leader, but does include a trailing position update.
      JSON.stringify({
        type: 'TimingData',
        json: {
          Lines: {
            '6': { Position: '19' },
          },
        },
        dateTime: '2024-01-01T00:01:00.000Z',
      }),
    ].join('\n');

    const summary = summarizeFromLines(raw);

    expect(summary.winner?.number).toBe('4');
  });
});

describe('parseLapTimeMs', () => {
  it('returns null for invalid formats or numeric parts', () => {
    const invalidValues = ['1:xx.000', '1:30.xxx', '1:', 'abc', '1:3a.000', '1:30.00x'];

    for (const value of invalidValues) {
      expect(parseLapTimeMs(value)).toBeNull();
    }
  });
});
