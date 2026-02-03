import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { RuntimePreparing } from './RuntimePreparing.js';

describe('RuntimePreparing', () => {
  it('renders progress text', () => {
    const { lastFrame } = render(
      <RuntimePreparing message="Preparing Python runtime" />,
    );
    expect(lastFrame()).toContain('Preparing Python runtime');
  });
});
