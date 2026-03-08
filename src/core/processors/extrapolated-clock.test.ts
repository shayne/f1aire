import { describe, expect, it } from 'vitest';
import {
  ExtrapolatedClockProcessor,
  parseExtrapolatedClockRemainingMs,
} from './extrapolated-clock.js';

describe('ExtrapolatedClockProcessor', () => {
  it('parses Remaining values into milliseconds', () => {
    expect(parseExtrapolatedClockRemainingMs('01:02:03.456')).toBe(3_723_456);
    expect(parseExtrapolatedClockRemainingMs('00:00:10')).toBe(10_000);
    expect(parseExtrapolatedClockRemainingMs('bad')).toBeNull();
  });

  it('projects the remaining time while extrapolating', () => {
    const processor = new ExtrapolatedClockProcessor();

    processor.process({
      type: 'ExtrapolatedClock',
      json: {
        Utc: '2025-01-01T12:00:00Z',
        Remaining: '00:10:00',
        Extrapolating: true,
      },
      dateTime: new Date('2025-01-01T12:00:00Z'),
    });

    expect(
      processor.getRemainingAt(new Date('2025-01-01T12:00:15Z')),
    ).toMatchObject({
      remainingMs: 585_000,
      remainingSeconds: 585,
      extrapolating: true,
      expired: false,
    });
  });

  it('returns the historical clock state for earlier as-of times', () => {
    const processor = new ExtrapolatedClockProcessor();

    processor.process({
      type: 'ExtrapolatedClock',
      json: {
        Utc: '2025-01-01T12:00:00Z',
        Remaining: '00:10:00',
        Extrapolating: true,
      },
      dateTime: new Date('2025-01-01T12:00:00Z'),
    });
    processor.process({
      type: 'ExtrapolatedClock',
      json: {
        Utc: '2025-01-01T12:02:00Z',
        Remaining: '00:08:00',
        Extrapolating: false,
      },
      dateTime: new Date('2025-01-01T12:02:00Z'),
    });

    expect(
      processor.getRemainingAt(new Date('2025-01-01T12:00:30Z')),
    ).toMatchObject({
      remainingMs: 570_000,
      extrapolating: true,
    });
    expect(
      processor.getRemainingAt(new Date('2025-01-01T12:02:30Z')),
    ).toMatchObject({
      remainingMs: 480_000,
      extrapolating: false,
    });
    expect(processor.getAt(new Date('2025-01-01T12:00:30Z'))).toMatchObject({
      Utc: '2025-01-01T12:00:00Z',
      Remaining: '00:10:00',
    });
  });
});
