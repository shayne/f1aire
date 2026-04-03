import React from 'react';
import { Text } from '#ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './provider.js';
import { darkTheme, type F1aireTheme } from './tokens.js';

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
});
