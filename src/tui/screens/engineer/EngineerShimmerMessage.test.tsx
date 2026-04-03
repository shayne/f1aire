import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Box } from '#ink';
import { renderTui } from '#ink/testing';
import { darkTheme } from '../../theme/tokens.js';

const themeProvider = vi.hoisted(() => ({
  useTheme: vi.fn(),
}));

vi.mock('../../theme/provider.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../theme/provider.js')
  >('../../theme/provider.js');

  return {
    ...actual,
    useTheme: themeProvider.useTheme,
  };
});

import { EngineerShimmerMessage } from './EngineerShimmerMessage.js';

describe('EngineerShimmerMessage', () => {
  beforeEach(() => {
    themeProvider.useTheme.mockReset();
    themeProvider.useTheme.mockReturnValue(darkTheme);
  });

  it('renders the status text through the shimmer component', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Box flexDirection="row">
        <EngineerShimmerMessage
          message="Thinking..."
          glimmerIndex={2}
          mode="thinking"
        />
      </Box>,
    );

    expect(lastFrame()).toBe('Thinking...');
    expect(themeProvider.useTheme).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('renders nothing for an empty message', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerShimmerMessage
        message=""
        glimmerIndex={0}
        mode="thinking"
      />,
    );

    expect(lastFrame()).toBe('');
    unmount();
  });
});
