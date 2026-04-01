import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { buildTerminalTitle, createTerminalLink } from './terminal-chrome.js';

describe('buildTerminalTitle', () => {
  it('builds an engineer title with a streaming prefix', () => {
    expect(
      buildTerminalTitle({
        screenName: 'engineer',
        breadcrumb: ['2025', 'Test GP', 'Race', 'Engineer'],
        isStreaming: true,
      }),
    ).toBe('⠂ F1aire · 2025 · Test GP · Race · Engineer');
  });

  it('builds a stable title when idle', () => {
    expect(
      buildTerminalTitle({
        screenName: 'summary',
        breadcrumb: ['Summary'],
        isStreaming: false,
      }),
    ).toBe('F1aire · Summary');
  });
});

describe('createTerminalLink', () => {
  it('falls back to plain text when hyperlinks are unavailable', () => {
    expect(
      createTerminalLink('/tmp/f1aire/config.json', {
        label: '/tmp/f1aire/config.json',
        supportsHyperlinks: false,
      }),
    ).toBe('/tmp/f1aire/config.json');
  });

  it('wraps file paths in OSC 8 hyperlinks when supported', () => {
    const target = '/tmp/f1aire/config.json';
    expect(
      createTerminalLink(target, {
        label: 'config.json',
        supportsHyperlinks: true,
      }),
    ).toContain(`${pathToFileURL(target).href}`);
  });
});
