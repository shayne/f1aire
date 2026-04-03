import React from 'react';
import { Text } from '#ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import {
  darkTheme,
  theme,
  ThemeProvider,
  useTheme,
  type F1aireTheme,
} from '../theme.js';

function Probe(): React.JSX.Element {
  const theme = useTheme();

  return <Text>{`${theme.name}:${theme.text.brand}`}</Text>;
}

function createProbeTheme(): F1aireTheme {
  return {
    ...darkTheme,
    name: 'dark',
    text: {
      ...darkTheme.text,
      brand: 'rgb(1,2,3)',
    },
  };
}

describe('ThemeProvider', () => {
  it('exposes semantic color tokens to child components', () => {
    const { lastFrame } = render(
      <ThemeProvider value={createProbeTheme()}>
        <Probe />
      </ThemeProvider>,
    );

    expect(lastFrame()).toBe('dark:rgb(1,2,3)');
  });

  it('keeps the legacy theme singleton mapped to the default semantic theme', () => {
    expect(theme.brand).toBe(darkTheme.text.brand);
    expect(theme.status.tool).toBe(darkTheme.status.tool);
  });
});
