import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer.js';
import { useComposerState } from './useComposerState.js';

function Harness({
  isStreaming = false,
  onSend,
}: {
  isStreaming?: boolean;
  onSend: (text: string) => void;
}) {
  const state = useComposerState({ onSend, isStreaming });
  return <Composer state={state} isStreaming={isStreaming} />;
}

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Composer', () => {
  it('submits on Enter and clears the local draft', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('pit');
    await waitForTick();
    expect(lastFrame()).toContain('pit');

    stdin.write('\r');
    await waitForTick();

    expect(onSend).toHaveBeenCalledWith('pit');
    expect(lastFrame()).not.toContain('pit');
  });

  it('renders the newline hint in the footer copy', () => {
    const { lastFrame } = render(<Harness onSend={vi.fn()} />);

    expect(lastFrame()).toContain('shift+enter newline');
  });

  it('keeps accepting typing but blocks Enter while streaming', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(
      <Harness onSend={onSend} isStreaming />,
    );

    await waitForTick();
    stdin.write('pit');
    await waitForTick();
    expect(lastFrame()).toContain('pit');

    stdin.write('\r');
    await waitForTick();

    expect(onSend).not.toHaveBeenCalled();
    expect(lastFrame()).toContain('pit');
  });
});
