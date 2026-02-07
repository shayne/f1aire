import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Settings } from './Settings.js';

describe('Settings', () => {
  it('renders key status', () => {
    const { lastFrame } = render(
      <Settings
        status={{
          envKeyPresent: false,
          storedKeyPresent: true,
          inUse: 'stored',
        }}
        onAction={vi.fn()}
      />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Env key');
    expect(frame).toContain('Stored key');
    expect(frame).toContain('In use');
    expect(frame).toContain('stored');
  });
});

