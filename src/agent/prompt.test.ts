import { describe, it, expect } from 'vitest';
import { systemPrompt } from './prompt.js';

describe('systemPrompt', () => {
  it('includes Engineer Python Skill section', () => {
    expect(systemPrompt).toContain('Engineer Python Skill');
    expect(systemPrompt).toContain('run_py');
  });
});
