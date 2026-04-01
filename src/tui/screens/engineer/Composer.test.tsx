import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
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
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} />,
    );

    await waitForTick();
    stdin.write('pit');
    await waitForTick();
    expect(lastFrame()).toContain('pit');

    stdin.write('\r');
    await waitForTick();

    expect(onSend).toHaveBeenCalledWith('pit');
    expect(lastFrame()).not.toContain('pit');
    unmount();
  });

  it('submits a queued burst without waiting for an intermediate render', async () => {
    const onSend = vi.fn();
    const { stdin, unmount } = await renderTui(<Harness onSend={onSend} />);

    await waitForTick();
    stdin.write('abc\r');
    await waitForTick();

    expect(onSend).toHaveBeenCalledWith('abc');
    unmount();
  });

  it('renders the newline hint in the footer copy', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Harness onSend={vi.fn()} />,
    );

    expect(lastFrame()).toContain('shift+enter newline');
    unmount();
  });

  it('keeps accepting typing but blocks Enter while streaming', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
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
    unmount();
  });

  it('treats terminal delete as backspace', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} />,
    );

    await waitForTick();
    stdin.write('ab');
    await waitForTick();
    stdin.write('\x7f');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('a');
    expect(frame).not.toContain('ab');
    unmount();
  });

  it('applies cursor edits to the latest queued state', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} />,
    );

    await waitForTick();
    stdin.write('abc');
    await waitForTick();
    stdin.write('\u001b[D');
    stdin.write('\u001b[D');
    stdin.write('X');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('aX▌bc');
    unmount();
  });

  it('normalizes a modified-enter escape sequence to a newline', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} />,
    );

    await waitForTick();
    stdin.write('ab');
    stdin.write('\u001b[13;2u');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).toContain('ab');
    expect(frame).not.toContain('[13;2u');
    unmount();
  });

  it('grows to five visible wrapped lines before scrolling older content away', async () => {
    const onSend = vi.fn();
    const onHeightChange = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} onHeightChange={onHeightChange} width={3} />,
    );

    await waitForTick();
    stdin.write('abcdefghijklmnopqr');
    await waitForTick();

    expect(onHeightChange).toHaveBeenLastCalledWith(5);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('abc');
    expect(frame).toContain('ghi');
    expect(frame).toContain('pqr');
    unmount();
  });
});
