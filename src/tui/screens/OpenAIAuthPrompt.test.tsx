import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { OpenAIAuthPrompt } from './OpenAIAuthPrompt.js';

describe('OpenAIAuthPrompt', () => {
  it('renders ChatGPT as the recommended first auth option with API-key fallback', async () => {
    const app = await renderTui(
      <OpenAIAuthPrompt
        onSelect={vi.fn()}
        envKeyPresent={true}
        storedKeyPresent={false}
      />,
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Sign in with ChatGPT');
    expect(frame).toContain('Use ChatGPT account (recommended)');
    expect(frame).toContain('Use OpenAI API key');
    expect(frame).toContain('OPENAI_API_KEY detected');

    app.unmount();
  });
});
