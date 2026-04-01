import React from 'react';
import { describe, expect, it } from 'vitest';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { EngineerShell } from './EngineerShell.js';

describe('EngineerShell', () => {
  it('renders a compact session strip, scrollable transcript slot, and pinned bottom slot', async () => {
    const ui = await renderTui(
      <EngineerShell
        top={<Text>2026 Monaco GP · Race · Latest</Text>}
        scrollable={<Text>Sector 2 is the weak point.</Text>}
        bottom={<Text>› push now</Text>}
      />,
      { columns: 80, rows: 18 },
    );

    const frame = ui.lastFrame();
    expect(frame).toContain('2026 Monaco GP · Race · Latest');
    expect(frame).toContain('Sector 2 is the weak point.');
    expect(frame).toContain('› push now');
  });
});
