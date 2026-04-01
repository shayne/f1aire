import { describe, expect, it } from 'vitest';
import {
  getTranscriptWindow,
  reconcilePausedOffset,
  getTranscriptScrollHint,
} from './useTranscriptViewport.js';

describe('reconcilePausedOffset', () => {
  it('preserves the same transcript slice when new rows arrive while paused', () => {
    expect(
      reconcilePausedOffset({
        previousRowCount: 18,
        nextRowCount: 21,
        previousVisibleLineCount: 8,
        nextVisibleLineCount: 8,
        currentScrollOffsetLines: 6,
      }),
    ).toBe(9);
  });

  it('keeps the same top row when the paused viewport height changes', () => {
    expect(
      reconcilePausedOffset({
        previousRowCount: 20,
        nextRowCount: 20,
        previousVisibleLineCount: 8,
        nextVisibleLineCount: 10,
        currentScrollOffsetLines: 6,
      }),
    ).toBe(4);
  });
});

describe('getTranscriptWindow', () => {
  it('returns the live tail when the viewport is following output', () => {
    expect(
      getTranscriptWindow({
        rowCount: 20,
        visibleLineCount: 6,
        scrollOffsetLines: 0,
      }),
    ).toEqual({ start: 14, end: 20 });
  });
});

describe('getTranscriptScrollHint', () => {
  it('returns catch-up copy when newer output is below the paused viewport', () => {
    expect(
      getTranscriptScrollHint({
        isScrolledUp: true,
        hasUpdatesBelow: true,
      }),
    ).toBe('New updates below · pgdn to catch up');
  });
});
