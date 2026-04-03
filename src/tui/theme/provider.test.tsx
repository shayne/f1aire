import React from 'react';
import { Text } from '#ink';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  darkTheme,
  lightTheme,
  theme,
  ThemeProvider,
  useTheme,
  type F1aireTheme,
} from '../theme.js';
import {
  resetCachedSystemThemeForTests,
  setCachedSystemTheme,
} from './system-theme.js';

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
  afterEach(() => {
    resetCachedSystemThemeForTests();
  });

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

  it('defines a light palette with dark body text and the same semantic token shape', () => {
    expect(lightTheme.name).toBe('light');
    expect(lightTheme.text.primary).toBe('rgb(0,0,0)');
    expect(lightTheme.text.brand).toBe('rgb(215,119,87)');
    expect(lightTheme.transcript.user).toBe('rgb(37,99,235)');
    expect(lightTheme.transcript.assistant).toBe('rgb(215,119,87)');
    expect(lightTheme.composer.placeholder).toBe('rgb(102,102,102)');
    expect(lightTheme.status.thinkingShimmer).toBe('rgb(245,149,117)');
  });

  it('resolves the default provider theme from the cached system theme', () => {
    setCachedSystemTheme('light');

    const { lastFrame } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(lastFrame()).toBe('light:rgb(215,119,87)');
  });
});
