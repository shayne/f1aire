import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from '#ink';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppStateProvider, createAppStore, useAppState } from './app-store.js';
import { createInitialAppState } from './app-state.js';

function ScreenProbe({ onRender }: { onRender: () => void }) {
  const screenName = useAppState((state) => state.screen.name);
  onRender();
  return <Text>{screenName}</Text>;
}

function StreamingProbe({ onRender }: { onRender: () => void }) {
  const isStreaming = useAppState((state) => state.engineer.isStreaming);
  onRender();
  return <Text>{isStreaming ? 'streaming' : 'idle'}</Text>;
}

function ScreenSummaryProbe({ onRender }: { onRender: () => void }) {
  const summary = useAppState((state) => ({
    screenName: state.screen.name,
  }));
  onRender();
  return <Text>{summary.screenName}</Text>;
}

describe('AppStateProvider', () => {
  it('only re-renders subscribers whose selected slice changes', async () => {
    const store = createAppStore(createInitialAppState());
    const onScreenRender = vi.fn();
    const onStreamingRender = vi.fn();

    const { lastFrame } = render(
      <AppStateProvider store={store}>
        <ScreenProbe onRender={onScreenRender} />
        <StreamingProbe onRender={onStreamingRender} />
      </AppStateProvider>,
    );

    expect(lastFrame()).toContain('season');
    expect(lastFrame()).toContain('idle');

    onScreenRender.mockClear();
    onStreamingRender.mockClear();

    await act(async () => {
      store.setState((state) => ({
        ...state,
        engineer: { ...state.engineer, isStreaming: true },
      }));
    });

    expect(lastFrame()).toContain('streaming');
    expect(onScreenRender).toHaveBeenCalledTimes(0);
    expect(onStreamingRender).toHaveBeenCalledTimes(1);
  });

  it('keeps object selector results stable across unrelated updates', async () => {
    const store = createAppStore(createInitialAppState());
    const onSummaryRender = vi.fn();

    const { lastFrame } = render(
      <AppStateProvider store={store}>
        <ScreenSummaryProbe onRender={onSummaryRender} />
      </AppStateProvider>,
    );

    expect(lastFrame()).toContain('season');

    onSummaryRender.mockClear();

    await act(async () => {
      store.setState((state) => ({
        ...state,
        engineer: { ...state.engineer, isStreaming: true },
      }));
    });

    expect(lastFrame()).toContain('season');
    expect(onSummaryRender).toHaveBeenCalledTimes(0);
  });
});
