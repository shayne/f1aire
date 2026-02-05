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
});
