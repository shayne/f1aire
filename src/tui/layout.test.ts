import { describe, expect, it } from 'vitest';
import {
  getDataItems,
  fitRightPane,
  getRightPaneMode,
  getSessionItems,
  type DataStatus,
} from './layout.js';

describe('layout helpers', () => {
  it('selects right pane modes by row count', () => {
    expect(getRightPaneMode(24)).toBe('minimal');
    expect(getRightPaneMode(34)).toBe('compact');
    expect(getRightPaneMode(44)).toBe('full');
  });

  it('shrinks session items when rows are limited', () => {
    const summary = {
      winner: { name: 'Max', number: 1 },
      fastestLap: { name: 'Lando', number: 4, time: '1:32.000' },
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

  it('limits data items in compact mode', () => {
    const dataStatus: DataStatus = {
      drivers: 20,
      laps: 56,
      hasLastLap: true,
      hasSectors: true,
      hasStints: true,
      hasCarData: true,
      hasPosition: true,
      hasRaceControl: true,
      hasTeamRadio: true,
      hasWeather: true,
      hasPitStops: true,
    };

    expect(getDataItems({ mode: 'minimal', modelId: 'gpt', dataStatus })).toHaveLength(0);
    expect(getDataItems({ mode: 'compact', modelId: 'gpt', dataStatus })).toHaveLength(6);
    expect(getDataItems({ mode: 'full', modelId: 'gpt', dataStatus })).toHaveLength(12);
  });

  it('fits right pane data items within the row budget', () => {
    const sessionItems = getSessionItems({
      mode: 'minimal',
      year: 2025,
      meetingName: 'Test',
      sessionName: 'Race',
      sessionType: 'Race',
      summary: null,
    });
    const dataItems = getDataItems({
      mode: 'full',
      modelId: 'gpt',
      dataStatus: {
        drivers: 20,
        laps: 56,
        hasLastLap: true,
        hasSectors: true,
        hasStints: true,
        hasCarData: true,
        hasPosition: true,
        hasRaceControl: true,
        hasTeamRadio: true,
        hasWeather: true,
        hasPitStops: true,
      },
    });

    const layout = fitRightPane({
      rows: 26,
      mode: 'compact',
      sessionItems,
      activityEntries: ['A', 'B', 'C', 'D'],
      dataItems,
    });

    expect(layout.dataItems.length).toBe(6);
  });
});
