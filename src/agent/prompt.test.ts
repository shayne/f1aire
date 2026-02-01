import { describe, expect, it } from 'vitest';
import { engineerJsSkill, engineerSystemPrompt } from './prompt.js';

describe('engineerSystemPrompt', () => {
  it('embeds the engineer JS skill and guidance', () => {
    expect(engineerSystemPrompt).toContain('race engineer');
    expect(engineerSystemPrompt).toContain('tools');
    expect(engineerSystemPrompt).toContain(engineerJsSkill);
  });
});

describe('engineerJsSkill', () => {
  it('describes globals and examples', () => {
    expect(engineerJsSkill).toContain('Available globals');
    expect(engineerJsSkill).toContain('store');
    expect(engineerJsSkill).toContain('processors');
    expect(engineerJsSkill).toContain('raw');
    expect(engineerJsSkill).toContain('Examples');
  });
});
