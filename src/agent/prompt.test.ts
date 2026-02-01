import { describe, it, expect } from 'vitest';
import { systemPrompt } from './prompt.js';

describe('systemPrompt', () => {
  it('includes Engineer JS Skill section', () => {
    expect(systemPrompt).toContain('Engineer JS Skill');
    expect(systemPrompt).toContain('store');
    expect(systemPrompt).toContain('processors');
  });
});
