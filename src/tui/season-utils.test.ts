import { describe, expect, it } from 'vitest';
import { getSeasonOptions } from './season-utils.js';

describe('getSeasonOptions', () => {
  it('returns 10 descending seasons', () => {
    const seasons = getSeasonOptions(2026);
    expect(seasons).toHaveLength(10);
    expect(seasons[0]).toBe(2026);
    expect(seasons[9]).toBe(2017);
  });
});
