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
});
