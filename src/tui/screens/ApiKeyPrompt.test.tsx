import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { ApiKeyPrompt } from './ApiKeyPrompt.js';

describe('ApiKeyPrompt', () => {
  it('explains how to activate f1aire and how environment keys override stored keys', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ApiKeyPrompt
        configPath="/tmp/f1aire/config.json"
        error="Key rejected by OpenAI"
        onSave={vi.fn()}
      />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('OpenAI API key');
    expect(frame).toContain('f1aire');
    expect(frame).toContain('OPENAI_API_KEY');
    expect(frame).toContain('Key rejected by OpenAI');
    expect(frame).toContain('Paste a valid key');
    unmount();
  });
});
