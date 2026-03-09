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

  it('documents championship prediction as a patch feed', () => {
    expect(getDataBookTopic('ChampionshipPrediction')?.semantics).toBe('patch');
  });

  it('documents session data as a patch feed with normalized series keys', () => {
    expect(getDataBookTopic('SessionData')?.semantics).toBe('patch');
    expect(getDataBookTopic('SessionData')?.normalization).toContain(
      'Series and StatusSeries arrays are normalized to indexed dictionaries before patches are merged.',
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

  it('documents deterministic session lifecycle tooling', () => {
    expect(getDataBookTopic('SessionData')?.bestTools).toContain(
      'get_session_lifecycle',
    );
    expect(getDataBookTopic('SessionStatus')?.bestTools).toContain(
      'get_session_lifecycle',
    );
    expect(getDataBookTopic('ArchiveStatus')?.bestTools).toContain(
      'get_session_lifecycle',
    );
  });

  it('documents deterministic tla-rcm tooling', () => {
    expect(getDataBookTopic('TlaRcm')?.bestTools).toContain(
      'get_tla_rcm_events',
    );
  });
});
