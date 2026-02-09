import { describe, expect, it } from 'vitest';
import { getStreamTopicsForSessionType, getTopicDefinition } from './topic-registry.js';

describe('topic-registry', () => {
  it('includes modern all-session feeds for non-race sessions', () => {
    const topics = getStreamTopicsForSessionType('Practice');
    expect(topics).toContain('SessionInfo');
    expect(topics).toContain('ArchiveStatus');
    expect(topics).toContain('CurrentTyres');
    expect(topics).toContain('TyreStintSeries');
    expect(topics).toContain('LapSeries');
    expect(topics).toContain('WeatherDataSeries');
    expect(topics).toContain('TimingDataF1');
    expect(topics).not.toContain('DriverRaceInfo');
    expect(topics).not.toContain('OvertakeSeries');
  });

  it('includes race-only feeds for race sessions', () => {
    const topics = getStreamTopicsForSessionType('Race');
    expect(topics).toContain('DriverRaceInfo');
    expect(topics).toContain('OvertakeSeries');
    expect(topics).toContain('PitStopSeries');
    expect(topics).toContain('ChampionshipPrediction');
  });

  it('treats sprint sessions as race-like for race-only feeds', () => {
    const topics = getStreamTopicsForSessionType('Sprint');
    expect(topics).toContain('DriverRaceInfo');
    expect(topics).toContain('OvertakeSeries');
  });

  it('resolves definitions by canonical and stream names', () => {
    expect(getTopicDefinition('TimingDataF1')?.topic).toBe('TimingDataF1');
    expect(getTopicDefinition('CarData.z')?.topic).toBe('CarData');
    expect(getTopicDefinition('Position.z.jsonStream')?.topic).toBe('Position');
  });
});
