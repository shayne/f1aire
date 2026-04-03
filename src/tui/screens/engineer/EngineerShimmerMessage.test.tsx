import React from 'react';
import { describe, expect, it } from 'vitest';
import { Box } from '#ink';
import { renderTui } from '#ink/testing';
import { darkTheme } from '../../theme/tokens.js';
import { EngineerShimmerMessage } from './EngineerShimmerMessage.js';

describe('EngineerShimmerMessage', () => {
  it('renders the status text through the shimmer component', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Box flexDirection="row">
        <EngineerShimmerMessage
          message="Thinking..."
          glimmerIndex={2}
          messageColor={darkTheme.status.thinking}
          shimmerColor={darkTheme.status.thinkingShimmer}
        />
      </Box>,
    );

    expect(lastFrame()).toBe('Thinking...');
    unmount();
  });

  it('renders nothing for an empty message', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerShimmerMessage
        message=""
        glimmerIndex={0}
        messageColor={darkTheme.status.thinking}
        shimmerColor={darkTheme.status.thinkingShimmer}
      />,
    );

    expect(lastFrame()).toBe('');
    unmount();
  });
});
