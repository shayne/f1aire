import { useEffect } from 'react';
import { formatUnknownError } from '../../agent/error-utils.js';
import { ensurePyodideAssets } from '../../agent/pyodide/assets.js';
import { PYODIDE_VERSION } from '../../agent/pyodide/paths.js';
import type { RuntimeState } from '../state/app-state.js';
import { useSetAppState } from '../state/app-store.js';

type RuntimeProgressUpdate = NonNullable<RuntimeState['progress']> & {
  message: string;
};

type EnsureRuntime = (args: {
  onProgress: (update: RuntimeProgressUpdate) => void;
}) => Promise<void>;

const defaultEnsureRuntime: EnsureRuntime = async ({ onProgress }) => {
  await ensurePyodideAssets({
    version: PYODIDE_VERSION,
    onProgress,
  });
};

export function useRuntimeBootstrap({
  ensureRuntime = defaultEnsureRuntime,
}: {
  ensureRuntime?: EnsureRuntime;
} = {}): void {
  const setAppState = useSetAppState();

  useEffect(() => {
    let cancelled = false;

    const updateRuntime = (runtime: RuntimeState) => {
      if (cancelled) return;
      setAppState((state) => ({ ...state, runtime }));
    };

    updateRuntime({
      ready: false,
      message: 'Preparing Python runtime...',
      progress: null,
    });

    void (async () => {
      try {
        await ensureRuntime({
          onProgress: (update) => {
            updateRuntime({
              ready: false,
              message: update.message,
              progress: {
                phase: update.phase,
                downloadedBytes: update.downloadedBytes,
                totalBytes: update.totalBytes,
              },
            });
          },
        });
        if (cancelled) return;
        setAppState((state) => ({
          ...state,
          runtime: {
            ...state.runtime,
            ready: true,
          },
        }));
      } catch (error) {
        updateRuntime({
          ready: false,
          progress: null,
          message: `Python runtime failed: ${formatUnknownError(error)}`,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureRuntime, setAppState]);
}
