import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { Composer, renderComposerPlaceholder } from './Composer.js';
import { useComposerState } from './useComposerState.js';

function Harness({
  isStreaming = false,
  onSend,
  width = 32,
}: {
  isStreaming?: boolean;
  onSend: (text: string) => void;
  width?: number;
}) {
  const state = useComposerState({ onSend, isStreaming });
  return (
    <Composer
      state={state}
      isStreaming={isStreaming}
      width={width}
    />
  );
}

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));
const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Composer', () => {
  it('shows a prompt-oriented placeholder when the draft is empty', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Harness onSend={vi.fn()} />,
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain(
      'Ask the engineer about pace, tyres, traffic, or strategy...',
    );
    unmount();
  });

  it('dims the placeholder copy so it reads differently from typed text', async () => {
    const placeholder = renderComposerPlaceholder();

    expect(React.isValidElement(placeholder)).toBe(true);
    expect(
      React.isValidElement(placeholder) &&
        (placeholder.props as { dimColor?: boolean }).dimColor,
    ).toBe(true);
  });

  it('renders the footer hint on the final visible row without trailing blank padding', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Harness onSend={vi.fn()} />,
    );

    const rows = stripAnsi(lastFrame() ?? '')
      .split('\n')
      .map((row) => row.trimEnd());
    const lastNonEmptyRow = rows.findLastIndex((row) => row.trim().length > 0);

    expect(rows[lastNonEmptyRow]?.trim()).toBe(
      'enter send · shift+enter newline · tab details',
    );
    expect(rows.slice(lastNonEmptyRow + 1)).toEqual([]);
    unmount();
  });

  it('submits on Enter and clears the local draft', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} />,
    );

    await waitForTick();
    stdin.write('pit');
    await waitForTick();

    const typedFrame = lastFrame() ?? '';
    expect(typedFrame).toContain('pit');
    expect(typedFrame).not.toContain(
      'Ask the engineer about pace, tyres, traffic, or strategy...',
    );

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
    expect(lastFrame()).toContain('tab details');
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
    expect(frame).toContain('› a▌');
    expect(frame).not.toContain('› ab');
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
    const { stdin, lastFrame, unmount } = await renderTui(
      <Harness onSend={onSend} width={3} />,
    );

    await waitForTick();
    stdin.write('abcdefghijklmnopqr');
    await waitForTick();

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('abc');
    expect(frame).toContain('ghi');
    expect(frame).toContain('pqr');
    unmount();
  });
});
