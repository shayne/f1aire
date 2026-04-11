import { describe, it, expect } from 'vitest';
import { systemPrompt } from './prompt.js';

describe('systemPrompt', () => {
  it('includes Engineer Python Skill section', () => {
    expect(systemPrompt).toContain('Engineer Python Skill');
    expect(systemPrompt).toContain('run_py');
  });

  it('documents call_tool in system prompt', () => {
    expect(systemPrompt).toContain('call_tool');
  });

  it('discourages vars payloads in favor of call_tool', () => {
    expect(systemPrompt).toContain('vars only for tiny constants');
    expect(systemPrompt).toContain('Do not pass data/state via vars');
  });

  it('warns against asyncio.run in the Pyodide runtime', () => {
    expect(systemPrompt).toContain('asyncio.run');
    expect(systemPrompt).toContain('run_until_complete');
  });

  it('mentions the team radio playback and transcription tools', () => {
    expect(systemPrompt).toContain('play_team_radio');
    expect(systemPrompt).toContain('transcribe_team_radio');
  });

  it('mentions deterministic tyre tools for strategy questions', () => {
    expect(systemPrompt).toContain('get_current_tyres');
    expect(systemPrompt).toContain('get_tyre_stints');
  });

  it('mentions the lap series tool for position progression questions', () => {
    expect(systemPrompt).toContain('get_lap_series');
    expect(systemPrompt).toContain('lap-position history');
  });

  it('routes grid position questions to TimingAppData.GridPos', () => {
    expect(systemPrompt).toContain('GridPosition/GridPos');
    expect(systemPrompt).toContain('TimingAppData');
    expect(systemPrompt).toContain('GridPos');
  });

  it('mentions the overtake series tool for race-dynamics questions', () => {
    expect(systemPrompt).toContain('get_overtake_series');
  });

  it('mentions the driver tracker tool for board-state questions', () => {
    expect(systemPrompt).toContain('get_driver_tracker');
  });

  it('mentions the weather series tool for condition trend questions', () => {
    expect(systemPrompt).toContain('get_weather_series');
  });

  it('mentions stream metadata tools for playback workflows', () => {
    expect(systemPrompt).toContain('get_audio_streams');
    expect(systemPrompt).toContain('get_content_streams');
  });

  it('mentions deterministic pit stop event tooling', () => {
    expect(systemPrompt).toContain('get_pit_stop_events');
  });

  it('mentions replay control tools for cursor navigation', () => {
    expect(systemPrompt).toContain('get_replay_control');
    expect(systemPrompt).toContain('step_time_cursor');
  });

  it('documents the replay stepping rule', () => {
    expect(systemPrompt).toContain(
      'move forward/backward through replayed laps',
    );
    expect(systemPrompt).toContain(
      'confirm the resolved lap with get_replay_control',
    );
  });
});
