import React from 'react';
import { renderTui } from '#ink/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Keybinding } from './actions.js';
import { useKeybindings } from './use-keybindings.js';

function Harness({
  bindings,
}: {
  bindings: Keybinding[];
}): React.JSX.Element | null {
  useKeybindings({
    activeContexts: ['engineer', 'transcript'],
    bindings,
  });
  return null;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('useKeybindings', () => {
  it('prefers the most specific active context for page scroll actions', async () => {
    const onGlobal = vi.fn();
    const onTranscript = vi.fn();

    const { stdin, unmount } = await renderTui(
      <Harness
        bindings={[
          {
            action: 'global.back',
            context: 'global',
            key: { escape: true },
            run: onGlobal,
          },
          {
            action: 'transcript.pageUp',
            context: 'transcript',
            key: { pageUp: true },
            run: onTranscript,
          },
        ]}
      />,
    );

    await tick();
    stdin.write('\u001b[5~');
    await tick();

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onGlobal).toHaveBeenCalledTimes(0);
    unmount();
  });
});
