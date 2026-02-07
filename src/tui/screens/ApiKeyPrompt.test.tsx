import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { ApiKeyPrompt } from './ApiKeyPrompt.js';

describe('ApiKeyPrompt', () => {
  it('renders copy explaining env override behavior', () => {
    const { lastFrame } = render(
      <ApiKeyPrompt
        configPath="/tmp/f1aire/config.json"
        onSave={vi.fn()}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('OpenAI API Key');
    expect(frame).toContain('OPENAI_API_KEY');
  });
});

