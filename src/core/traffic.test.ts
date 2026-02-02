import { describe, expect, it } from 'vitest';
import { classifyTraffic } from './traffic.js';

describe('classifyTraffic', () => {
  it('labels traffic using lap-time scaled thresholds', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 0.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: true,
      }),
    ).toBe('traffic');
  });

  it('labels clean air on green laps with large gaps', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 2.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: true,
      }),
    ).toBe('clean');
  });

  it('never labels clean air on non-green laps', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 2.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: false,
      }),
    ).toBe('neutral');
  });
});
