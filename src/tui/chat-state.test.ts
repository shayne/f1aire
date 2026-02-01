import { describe, it, expect } from 'vitest';
import { appendUserMessage } from './chat-state.js';

describe('chat-state', () => {
  it('appends user messages', () => {
    const next = appendUserMessage([], 'why was lando slower?');
    expect(next[0].role).toBe('user');
  });
});
