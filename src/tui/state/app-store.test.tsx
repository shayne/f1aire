import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from '#ink';
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

    store.setState((state) => ({
      ...state,
      engineer: { ...state.engineer, isStreaming: true },
    }));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onScreenRender).toHaveBeenCalledTimes(0);
    expect(onStreamingRender).toHaveBeenCalledTimes(1);
  });
});
