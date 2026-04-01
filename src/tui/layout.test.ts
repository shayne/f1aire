import { describe, expect, it } from 'vitest';
import { getSessionItems } from './layout.js';

describe('layout helpers', () => {
  it('shrinks session items when rows are limited', () => {
    const summary = {
      winner: { name: 'Max', number: '1' },
      fastestLap: { name: 'Lando', number: '4', time: '1:32.000' },
      totalLaps: 56,
    };

    expect(
      getSessionItems({
        mode: 'minimal',
        year: 2025,
        meetingName: 'Test',
        sessionName: 'Race',
        sessionType: 'Race',
        summary,
      }).length,
    ).toBe(3);

    expect(
      getSessionItems({
        mode: 'compact',
        year: 2025,
        meetingName: 'Test',
        sessionName: 'Race',
        sessionType: 'Race',
        summary,
      }).length,
    ).toBe(5);

    expect(
      getSessionItems({
        mode: 'full',
        year: 2025,
        meetingName: 'Test',
        sessionName: 'Race',
        sessionType: 'Race',
        summary,
      }).length,
    ).toBe(6);
  });

  it('includes as-of label when provided', () => {
    const items = getSessionItems({
      mode: 'full',
      year: 2024,
      meetingName: 'Test GP',
      sessionName: 'Race',
      sessionType: 'Race',
      summary: null,
      asOfLabel: 'Lap 12',
    });

    expect(
      items.some((item) => item.label === 'As of' && item.value === 'Lap 12'),
    ).toBe(true);
  });

  it('returns summary rows as n/a when summary data is missing', () => {
    const items = getSessionItems({
      mode: 'compact',
      year: 2025,
      meetingName: 'Test',
      sessionName: 'Race',
      sessionType: 'Race',
      summary: {
        winner: null,
        fastestLap: null,
        totalLaps: null,
      },
    });

    expect(items).toContainEqual({ label: 'Winner', value: 'n/a' });
    expect(items).toContainEqual({ label: 'Fastest lap', value: 'n/a' });
  });
});
