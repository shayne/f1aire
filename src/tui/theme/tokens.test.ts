import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, type F1aireTheme } from './tokens.js';

const DARK_BG: Rgb = { r: 11, g: 11, b: 11 };
const LIGHT_BG: Rgb = { r: 255, g: 255, b: 255 };

const STRONG_TEXT_MIN = 4.5;
const SECONDARY_TEXT_MIN = 3;

type Rgb = { r: number; g: number; b: number };

function parseRgb(color: string): Rgb {
  const match = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(color);
  if (!match) {
    throw new Error(`Expected rgb color, received ${color}`);
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
  };
}

function channelLuminance(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function contrastRatio(foreground: string, background: Rgb): number {
  const fgLuminance = relativeLuminance(parseRgb(foreground));
  const bgLuminance = relativeLuminance(background);
  const lighter = Math.max(fgLuminance, bgLuminance);
  const darker = Math.min(fgLuminance, bgLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function expectThemeContrast(
  theme: F1aireTheme,
  background: Rgb,
): void {
  const strongTokens = {
    'text.primary': theme.text.primary,
    'text.secondary': theme.text.secondary,
    'text.brand': theme.text.brand,
    'chrome.panelTitle': theme.chrome.panelTitle,
    'chrome.selected': theme.chrome.selected,
    'transcript.user': theme.transcript.user,
    'transcript.assistant': theme.transcript.assistant,
    'composer.caret': theme.composer.caret,
    'composer.activeMarker': theme.composer.activeMarker,
    'status.thinking': theme.status.thinking,
    'status.tool': theme.status.tool,
    'status.error': theme.status.error,
    'status.ok': theme.status.ok,
  };

  const secondaryTokens = {
    'text.muted': theme.text.muted,
    'chrome.border': theme.chrome.border,
    'chrome.subtle': theme.chrome.subtle,
    'transcript.auxiliary': theme.transcript.auxiliary,
    'composer.inactiveMarker': theme.composer.inactiveMarker,
    'composer.placeholder': theme.composer.placeholder,
    'status.thinkingShimmer': theme.status.thinkingShimmer,
    'status.toolShimmer': theme.status.toolShimmer,
    'status.errorShimmer': theme.status.errorShimmer,
    'status.idle': theme.status.idle,
  };

  for (const [name, color] of Object.entries(strongTokens)) {
    expect(
      contrastRatio(color, background),
      `${theme.name} ${name} should contrast against the assumed terminal background`,
    ).toBeGreaterThanOrEqual(STRONG_TEXT_MIN);
  }

  for (const [name, color] of Object.entries(secondaryTokens)) {
    expect(
      contrastRatio(color, background),
      `${theme.name} ${name} should remain legible against the assumed terminal background`,
    ).toBeGreaterThanOrEqual(SECONDARY_TEXT_MIN);
  }
}

describe('f1aire semantic theme tokens', () => {
  it('keeps the dark palette readable on near-black terminals', () => {
    expectThemeContrast(darkTheme, DARK_BG);
  });

  it('keeps the light palette readable on white terminals', () => {
    expectThemeContrast(lightTheme, LIGHT_BG);
  });
});
