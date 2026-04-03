import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { EngineerStatusRow } from './EngineerStatusRow.js';

const animationFrameState = vi.hoisted(() => ({
  time: 120,
  ref: vi.fn(),
}));

vi.mock('../../../vendor/ink/hooks/use-animation-frame.js', () => ({
  useAnimationFrame: () => [animationFrameState.ref, animationFrameState.time],
}));

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');
const spinnerFramePattern = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/;

function getStatusGlyph(frame: string): string {
  const normalizedFrame = stripAnsi(frame);
  return normalizedFrame
    .split('')
    .find((char) => spinnerFramePattern.test(char)) ?? '';
}

describe('EngineerStatusRow', () => {
  beforeEach(() => {
    animationFrameState.time = 120;
    animationFrameState.ref.mockClear();
  });

  it('renders a real animated status glyph while streaming', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerStatusRow status="Thinking" isStreaming />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Thinking');
    expect(getStatusGlyph(frame)).toMatch(spinnerFramePattern);
    expect(frame).not.toContain('› Thinking');
    expect(frame).not.toMatch(/[▁▃▅▇]/);
    expect(frame).not.toMatch(/[·✢✳✶✻✽*]/);
    unmount();
  });

  it('advances the status glyph when animation time moves forward', async () => {
    const ui = await renderTui(
      <EngineerStatusRow status="Processing result: get_driver_list" isStreaming />,
    );

    const firstGlyph = getStatusGlyph(ui.lastFrame() ?? '');

    animationFrameState.time = 240;
    ui.rerender(
      <EngineerStatusRow
        status="Processing result: get_driver_list"
        isStreaming
      />,
    );

    const nextGlyph = getStatusGlyph(ui.lastFrame() ?? '');
    expect(nextGlyph).toMatch(spinnerFramePattern);
    expect(nextGlyph).not.toBe(firstGlyph);
    ui.unmount();
  });

  it('renders nothing when idle', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerStatusRow status="Idle" isStreaming={false} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toBe('');
    unmount();
  });

  it('can transition from idle to streaming without changing hook order', async () => {
    const ui = await renderTui(
      <EngineerStatusRow status="Idle" isStreaming={false} />,
    );

    ui.rerender(<EngineerStatusRow status="Thinking" isStreaming />);

    const frame = stripAnsi(ui.lastFrame() ?? '');
    expect(frame).toContain('Thinking');
    expect(getStatusGlyph(frame)).toMatch(spinnerFramePattern);
    ui.unmount();
  });
});
