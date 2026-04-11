import React from 'react';
import { describe, expect, it } from 'vitest';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { EngineerShell } from './EngineerShell.js';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function mousePress(col: number, row: number): string {
  return `\u001b[<0;${col};${row}M`;
}

function mouseDrag(col: number, row: number): string {
  return `\u001b[<32;${col};${row}M`;
}

function mouseRelease(col: number, row: number): string {
  return `\u001b[<0;${col};${row}m`;
}

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

  it('copies selected text on mouse-up in fullscreen mode', async () => {
    const previousSshConnection = process.env.SSH_CONNECTION;
    const previousTmux = process.env.TMUX;
    process.env.SSH_CONNECTION = 'test';
    delete process.env.TMUX;

    try {
      const ui = await renderTui(
        <EngineerShell
          top={<Text>Copy Source</Text>}
          scrollable={<Text>Sector 2 is the weak point.</Text>}
          bottom={<Text>› push now</Text>}
        />,
        { columns: 80, rows: 18 },
      );

      let output = '';
      ui.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8');
      });
      await tick();
      output = '';

      ui.stdin.write(mousePress(1, 1));
      ui.stdin.write(mouseDrag(4, 1));
      ui.stdin.write(mouseRelease(4, 1));
      await tick();

      expect(output).toContain(
        `\u001b]52;c;${Buffer.from('Copy', 'utf8').toString('base64')}\u0007`,
      );
      ui.unmount();
    } finally {
      if (previousSshConnection === undefined) {
        delete process.env.SSH_CONNECTION;
      } else {
        process.env.SSH_CONNECTION = previousSshConnection;
      }
      if (previousTmux === undefined) {
        delete process.env.TMUX;
      } else {
        process.env.TMUX = previousTmux;
      }
    }
  });
});
