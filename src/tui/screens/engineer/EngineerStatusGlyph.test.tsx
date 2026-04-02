import React from 'react';
import { describe, expect, it } from 'vitest';
import { Box, Text } from '#ink';
import { renderTui } from '#ink/testing';
import { theme } from '../../theme.js';
import { EngineerStatusGlyph } from './EngineerStatusGlyph.js';

const stripAnsi = (value: string): string =>
  value.replace(/\u001b\[[0-9;]*m/g, '');

describe('EngineerStatusGlyph', () => {
  it('renders one fixed-width Braille spinner cell', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Box flexDirection="row">
        <EngineerStatusGlyph time={80} color={theme.status.thinking} />
        <Text>next</Text>
      </Box>,
    );

    expect(stripAnsi(lastFrame() ?? '')).toBe('⠙ next');
    unmount();
  });

  it('renders the idle glyph from the same spinner alphabet', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Box flexDirection="row">
        <EngineerStatusGlyph
          time={640}
          color={theme.status.thinking}
          isIdle
        />
        <Text>idle</Text>
      </Box>,
    );

    expect(stripAnsi(lastFrame() ?? '')).toBe('⠋ idle');
    unmount();
  });
});
