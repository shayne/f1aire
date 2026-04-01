import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { Header } from './Header.js';

describe('Header', () => {
  it('renders a branded masthead without a boxed frame', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Header
        breadcrumb={['2026', 'Bahrain', 'Day 1']}
        title="f1aire - Virtual Race Engineer"
      />,
      { columns: 100, rows: 12 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('f1aire');
    expect(frame).toContain('Virtual Race Engineer');
    expect(frame).toContain('2026 / Bahrain / Day 1');
    expect(frame).not.toContain('╭');
    expect(frame).not.toContain('╰');
    unmount();
  });
});
