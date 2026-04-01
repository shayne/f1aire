import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer.js';
import { useComposerState } from './useComposerState.js';

function Harness({
  isStreaming = false,
  onSend,
  onHeightChange,
  width = 32,
}: {
  isStreaming?: boolean;
  onSend: (text: string) => void;
  onHeightChange?: (visibleLineCount: number) => void;
  width?: number;
}) {
  const state = useComposerState({ onSend, isStreaming });
  return (
    <Composer
      state={state}
      isStreaming={isStreaming}
      width={width}
      onHeightChange={onHeightChange}
    />
  );
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

  it('submits a queued burst without waiting for a render tick', async () => {
    const onSend = vi.fn();
    const { stdin } = render(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('abc');
    stdin.write('\r');
    await waitForTick();

    expect(onSend).toHaveBeenCalledWith('abc');
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

  it('treats terminal delete as backspace', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('ab');
    await waitForTick();
    stdin.write('\x7f');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('a');
    expect(frame).not.toContain('ab');
  });

  it('applies cursor edits to the latest queued state', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('abc');
    await waitForTick();
    stdin.write('\u001b[D');
    stdin.write('\u001b[D');
    stdin.write('X');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('aX▌bc');
  });

  it('normalizes a modified-enter escape sequence to a newline', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('ab');
    stdin.write('\u001b[13;2u');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('ab');
    expect(frame).not.toContain('[13;2u');
  });

  it('grows to five visible wrapped lines before scrolling older content away', async () => {
    const onSend = vi.fn();
    const onHeightChange = vi.fn();
    const { stdin, lastFrame } = render(
      <Harness onSend={onSend} onHeightChange={onHeightChange} width={3} />,
    );

    await waitForTick();
    stdin.write('abcdefghijklmnopqr');
    await waitForTick();

    expect(onHeightChange).toHaveBeenLastCalledWith(5);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('abc');
    expect(frame).toContain('def');
    expect(frame).toContain('pqr');
  });
});
