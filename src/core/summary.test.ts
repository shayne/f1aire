import { describe, expect, it } from 'vitest';
import { summarizeFromLines } from './summary.js';

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
});
