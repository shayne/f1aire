import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { darkTheme, type F1aireTheme } from '../theme/tokens.js';

const themeProvider = vi.hoisted(() => ({
  useTheme: vi.fn(),
}));

vi.mock('../theme/provider.js', async () => {
  const actual = await vi.importActual<typeof import('../theme/provider.js')>(
    '../theme/provider.js',
  );

  return {
    ...actual,
    useTheme: themeProvider.useTheme,
  };
});

import { Header } from './Header.js';

function createHeaderTheme(): F1aireTheme {
  return {
    ...darkTheme,
    text: {
      ...darkTheme.text,
      brand: 'rgb(1,2,3)',
    },
  };
}

describe('Header', () => {
  beforeEach(() => {
    themeProvider.useTheme.mockReturnValue(createHeaderTheme());
  });

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

  it('keeps the product framing visible in compact mode', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Header title="f1aire - Virtual Race Engineer" compact />,
      { columns: 72, rows: 6 },
    );

    const frame = lastFrame() ?? '';

    expect(frame).toContain('f1aire');
    expect(frame).toContain('Virtual Race Engineer');
    unmount();
  });

  it('reads the provider-supplied semantic token map', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Header title="f1aire - Virtual Race Engineer" />,
      { columns: 80, rows: 8 },
    );

    expect(lastFrame() ?? '').toContain('f1aire');
    expect(themeProvider.useTheme).toHaveBeenCalled();
    unmount();
  });
});
