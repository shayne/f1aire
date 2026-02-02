import { describe, expect, it } from 'vitest';
import { resolveTimeCursor } from './time-cursor.js';

describe('resolveTimeCursor', () => {
  it('resolves latest when no cursor provided', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
    ]);
    const resolved = resolveTimeCursor({ lapTimes, lapNumbers: [1, 2] });
    expect(resolved.lap).toBe(2);
  });

  it('resolves nearest lap for out-of-range lap number', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
      [4, new Date('2024-01-01T00:03:10Z')],
    ]);
    const resolved = resolveTimeCursor({
      lapTimes,
      lapNumbers: [1, 2, 4],
      cursor: { lap: 3 },
    });
    expect(resolved.lap).toBe(2);
  });

  it('resolves nearest lap for iso timestamp', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
      [3, new Date('2024-01-01T00:02:10Z')],
    ]);
    const resolved = resolveTimeCursor({
      lapTimes,
      lapNumbers: [1, 2, 3],
      cursor: { iso: '2024-01-01T00:01:40Z' },
    });
    expect(resolved.lap).toBe(2);
  });
});
