import { describe, expect, it } from 'vitest';
import { getDataBookIndex, getDataBookTopic } from './data-book.js';

describe('data-book', () => {
  it('includes expanded modern feed references', () => {
    const index = getDataBookIndex();
    expect(index.find((entry) => entry.topic === 'CurrentTyres')).toBeTruthy();
    expect(
      index.find((entry) => entry.topic === 'TyreStintSeries'),
    ).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'TimingDataF1')).toBeTruthy();
    expect(
      index.find((entry) => entry.topic === 'DriverRaceInfo'),
    ).toBeTruthy();
    expect(
      index.find((entry) => entry.topic === 'WeatherDataSeries'),
    ).toBeTruthy();
    expect(index.find((entry) => entry.topic === 'ArchiveStatus')).toBeTruthy();
  });

  it('resolves topics and aliases', () => {
    expect(getDataBookTopic('TimingDataF1')?.topic).toBe('TimingDataF1');
    expect(getDataBookTopic('CarData.z')?.topic).toBe('CarData');
    expect(getDataBookTopic('Position.z')?.topic).toBe('Position');
  });

  it('documents the team radio playback and transcription workflow', () => {
    expect(getDataBookTopic('TeamRadio')?.bestTools).toContain(
      'play_team_radio',
    );
    expect(getDataBookTopic('TeamRadio')?.bestTools).toContain(
      'transcribe_team_radio',
    );
  });

  it('documents deterministic pit stop event tooling', () => {
    expect(getDataBookTopic('PitStopSeries')?.bestTools).toContain(
      'get_pit_stop_events',
    );
  });

  it('documents deterministic lap-series tooling', () => {
    expect(getDataBookTopic('LapSeries')?.bestTools).toContain(
      'get_lap_series',
    );
  });

  it('documents deterministic driver-tracker tooling', () => {
    expect(getDataBookTopic('DriverTracker')?.bestTools).toContain(
      'get_driver_tracker',
    );
  });

  it('documents deterministic overtake-series tooling', () => {
    expect(getDataBookTopic('OvertakeSeries')?.bestTools).toContain(
      'get_overtake_series',
    );
  });

  it('documents deterministic stream metadata tooling', () => {
    expect(getDataBookTopic('AudioStreams')?.bestTools).toContain(
      'get_audio_streams',
    );
    expect(getDataBookTopic('ContentStreams')?.bestTools).toContain(
      'get_content_streams',
    );
  });
});
