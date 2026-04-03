import { describe, it, expect } from 'vitest';
import { appendUserMessage } from './chat-state.js';

describe('chat-state', () => {
  it('appends user messages', () => {
    const next = appendUserMessage([], 'why was lando slower?');
    expect(next[0].role).toBe('user');
  });

  it('ignores blank or whitespace-only prompts', () => {
    const history = [{ role: 'assistant' as const, content: 'Ready.' }];

    expect(appendUserMessage(history, '')).toBe(history);
    expect(appendUserMessage(history, '   \n\t')).toBe(history);
  });
});
