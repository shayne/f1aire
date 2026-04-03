import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import type { EngineerStatusMode } from './engineer-status-animation.js';
import { useEngineerShimmerAnimation } from './useEngineerShimmerAnimation.js';

const animationFrameState = vi.hoisted(() => ({
  ref: vi.fn(),
  time: 0,
  intervals: [] as Array<number | null>,
}));

vi.mock('../../../vendor/ink/hooks/use-animation-frame.js', () => ({
  useAnimationFrame: (intervalMs: number | null) => {
    animationFrameState.intervals.push(intervalMs);
    return [animationFrameState.ref, animationFrameState.time] as const;
  },
}));

function ShimmerProbe({
  mode,
  message,
  isIdle = false,
}: {
  mode: EngineerStatusMode;
  message: string;
  isIdle?: boolean;
}): React.JSX.Element {
  const [ref, glimmerIndex] = useEngineerShimmerAnimation(
    mode,
    message,
    isIdle,
  );

  return <ink-text ref={ref}>{glimmerIndex}</ink-text>;
}

describe('useEngineerShimmerAnimation', () => {
  beforeEach(() => {
    animationFrameState.ref.mockClear();
    animationFrameState.time = 0;
    animationFrameState.intervals = [];
  });

  it('uses a fast 50ms glimmer cadence for requesting mode', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ShimmerProbe mode="requesting" message="Loading telemetry" />,
    );

    expect(animationFrameState.intervals.at(-1)).toBe(50);
    expect(lastFrame()).toBe('0');
    unmount();
  });

  it('uses a slower 200ms glimmer cadence and left-to-right shimmer for thinking mode', async () => {
    animationFrameState.time = 200;

    const { lastFrame, unmount } = await renderTui(
      <ShimmerProbe mode="thinking" message="Thinking..." />,
    );

    expect(animationFrameState.intervals.at(-1)).toBe(200);
    expect(lastFrame()).toBe('1');
    unmount();
  });

  it('pauses the shimmer clock and returns an offscreen index when idle', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ShimmerProbe mode="thinking" message="Idle" isIdle />,
    );

    expect(animationFrameState.intervals.at(-1)).toBeNull();
    expect(lastFrame()).toBe('-100');
    unmount();
  });
});
