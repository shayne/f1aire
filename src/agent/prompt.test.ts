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

  it('mentions the team radio transcription tool', () => {
    expect(systemPrompt).toContain('transcribe_team_radio');
  });

  it('mentions deterministic tyre tools for strategy questions', () => {
    expect(systemPrompt).toContain('get_current_tyres');
    expect(systemPrompt).toContain('get_tyre_stints');
  });

  it('mentions the weather series tool for condition trend questions', () => {
    expect(systemPrompt).toContain('get_weather_series');
  });

  it('mentions deterministic pit stop event tooling', () => {
    expect(systemPrompt).toContain('get_pit_stop_events');
  });
});
