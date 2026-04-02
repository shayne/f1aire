import React from 'react';
import { describe, expect, it } from 'vitest';
import { Box, Text, useStdout } from '#ink';
import { renderTui } from '#ink/testing';

describe('renderTui', () => {
  it('captures the latest frame from the copied renderer', async () => {
    const app = await renderTui(
      <Box flexDirection="column">
        <Text>lap delta</Text>
        <Text>tyre temp</Text>
      </Box>,
      { columns: 24, rows: 8 },
    );

    expect(app.lastFrame()).toContain('lap delta');
    expect(app.lastFrame()).toContain('tyre temp');

    app.unmount();
  });

  it('exposes the render stream through useStdout', async () => {
    const Probe = () => {
      const { stdout } = useStdout();
      return <Text>{stdout === process.stdout ? 'process' : 'custom'}</Text>;
    };

    const app = await renderTui(<Probe />, { columns: 24, rows: 8 });

    expect(app.lastFrame()).toContain('custom');

    app.unmount();
  });

  it('returns the current screen after rerender instead of accumulated writes', async () => {
    const app = await renderTui(<Text>lap delta</Text>, { columns: 24, rows: 8 });

    expect(app.lastFrame()).toContain('lap delta');

    app.rerender(<Text>sector pace</Text>);

    expect(app.lastFrame()).toContain('sector pace');
    expect(app.lastFrame()).not.toContain('lap delta');

    app.unmount();
  });

  it('resolves waitUntilExit even when called after unmount', async () => {
    const app = await renderTui(<Text>lap delta</Text>, { columns: 24, rows: 8 });

    app.unmount();

    const result = await Promise.race([
      app.waitUntilExit().then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('timed-out'), 50)),
    ]);

    expect(result).toBe('resolved');
  });

  it('forwards Box refs to the underlying DOM element', async () => {
    let attachedNodeName: string | null = null;

    const app = await renderTui(
      <Box
        ref={(node) => {
          attachedNodeName = node?.nodeName ?? null;
        }}
      >
        <Text>lap delta</Text>
      </Box>,
      { columns: 24, rows: 8 },
    );

    expect(attachedNodeName).toBe('ink-box');
    app.unmount();
  });
});
