import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from '#ink';
import { describe, expect, it, vi } from 'vitest';
import { createInitialAppState } from '../state/app-state.js';
import {
  AppStateProvider,
  createAppStore,
  useAppState,
} from '../state/app-store.js';
import { useRuntimeBootstrap } from './use-runtime-bootstrap.js';

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

type EnsureRuntime = (args: {
  onProgress: (update: RuntimeProgressUpdate) => void;
}) => Promise<void>;

function Probe({
  ensureRuntime,
}: {
  ensureRuntime: EnsureRuntime;
}) {
  useRuntimeBootstrap({ ensureRuntime });
  const runtime = useAppState((state) => state.runtime);
  return (
    <Text>
      {runtime.message} | {runtime.progress?.phase ?? 'none'}
    </Text>
  );
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
    expect(lastFrame()).toContain('extracting');
  });

  it('stores runtime failures and clears progress', async () => {
    const ensureRuntime = vi.fn(async ({ onProgress }) => {
      onProgress({
        phase: 'downloading',
        message: 'Downloading Python runtime...',
      });
      throw new Error('network unavailable');
    });
    const store = createAppStore(createInitialAppState());

    render(
      <AppStateProvider store={store}>
        <Probe ensureRuntime={ensureRuntime} />
      </AppStateProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().runtime).toEqual({
      ready: false,
      message: 'Python runtime failed: network unavailable',
      progress: null,
    });
  });

  it('ignores stale progress and completion updates after unmount', async () => {
    let reportProgress: ((update: RuntimeProgressUpdate) => void) | null = null;
    let resolveEnsureRuntime: (() => void) | null = null;
    const ensureRuntime = vi.fn(
      ({ onProgress }) =>
        new Promise<void>((resolve) => {
          reportProgress = onProgress;
          resolveEnsureRuntime = resolve;
        }),
    );
    const store = createAppStore(createInitialAppState());

    const app = render(
      <AppStateProvider store={store}>
        <Probe ensureRuntime={ensureRuntime} />
      </AppStateProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    app.unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));

    reportProgress?.({
      phase: 'ready',
      message: 'Python runtime ready.',
    });
    resolveEnsureRuntime?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().runtime).toEqual({
      ready: false,
      message: 'Preparing Python runtime...',
      progress: null,
    });
  });
});
