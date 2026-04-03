import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from '#ink';
import { describe, expect, it, vi } from 'vitest';
import { createInitialAppState } from '../state/app-state.js';
import { AppStateProvider, useAppState } from '../state/app-store.js';
import { useRuntimeBootstrap } from './use-runtime-bootstrap.js';

function Probe({
  ensureRuntime,
}: {
  ensureRuntime: (args: {
    onProgress: (update: {
      phase: 'downloading' | 'extracting' | 'ready';
      message: string;
    }) => void;
  }) => Promise<void>;
}) {
  useRuntimeBootstrap({ ensureRuntime });
  const runtimeMessage = useAppState((state) => state.runtime.message);
  return <Text>{runtimeMessage}</Text>;
}

describe('useRuntimeBootstrap', () => {
  it('stores runtime progress in the app store', async () => {
    const ensureRuntime = vi.fn(async ({ onProgress }) => {
      onProgress({
        phase: 'extracting',
        message: 'Extracting Python runtime...',
      });
    });

    const { lastFrame } = render(
      <AppStateProvider initialState={createInitialAppState()}>
        <Probe ensureRuntime={ensureRuntime} />
      </AppStateProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(lastFrame()).toContain('Extracting Python runtime...');
  });
});
