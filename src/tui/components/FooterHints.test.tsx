import { describe, expect, it } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FooterHints } from './FooterHints.js';

describe('FooterHints', () => {
  it('includes settings hint on non-chat screens', () => {
    const { lastFrame } = render(<FooterHints screen="season" />);
    expect(lastFrame()).toContain('s settings');
  });

  it('does not include settings hint on engineer screen', () => {
    const { lastFrame } = render(<FooterHints screen="engineer" />);
    expect(lastFrame()).not.toContain('s settings');
  });
});

