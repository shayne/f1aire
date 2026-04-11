import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { Settings } from './Settings.js';

describe('Settings', () => {
  it('shows ChatGPT-first auth controls and account status', async () => {
    const app = await renderTui(
      <Settings
        status={
          {
            chatGptSignedIn: true,
            chatGptAccountEmail: 'user@example.com',
            chatGptPlanType: 'plus',
            envKeyPresent: true,
            openaiAuthPreference: 'chatgpt',
            storedKeyPresent: true,
            inUse: 'chatgpt',
          } as any
        }
        onAction={vi.fn()}
      />,
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Sign in with ChatGPT account');
    expect(frame).toContain('Use ChatGPT account (recommended)');
    expect(frame).toContain('Use OpenAI API key');
    expect(frame).toContain('user@example.com');
    expect(frame).toContain('plus');
    expect(frame).toContain('Preference: chatgpt');
    expect(frame).toContain('In use: chatgpt');

    app.unmount();
  });
});
