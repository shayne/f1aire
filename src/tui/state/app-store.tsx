import React, {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { AppState } from './app-state.js';
import { createInitialAppState } from './app-state.js';

type AppStore = {
  getState: () => AppState;
  setState: (update: AppState | ((state: AppState) => AppState)) => void;
  subscribe: (listener: () => void) => () => void;
};

const AppStoreContext = createContext<AppStore | null>(null);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function areSelectedValuesEqual<T>(previous: T, next: T): boolean {
  if (Object.is(previous, next)) return true;
  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) return false;
    for (let index = 0; index < previous.length; index += 1) {
      if (!Object.is(previous[index], next[index])) return false;
    }
    return true;
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length) return false;
    for (const key of previousKeys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) return false;
      if (!Object.is(previous[key], next[key])) return false;
    }
    return true;
  }
  return false;
}

export function createAppStore(
  initialState: AppState = createInitialAppState(),
): AppStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (update) => {
      const nextState = typeof update === 'function' ? update(state) : update;
      if (Object.is(nextState, state)) return;
      state = nextState;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function AppStateProvider({
  children,
  initialState,
  store,
}: {
  children: React.ReactNode;
  initialState?: AppState;
  store?: AppStore;
}): React.JSX.Element {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = store ?? createAppStore(initialState);
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

function useAppStore(hookName: 'useAppState' | 'useSetAppState'): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error(
      `${hookName} must be used within <AppStateProvider>.`,
    );
  }
  return store;
}

export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore('useAppState');
  const snapshotRef = useRef<{ hasValue: boolean; value: T | undefined }>({
    hasValue: false,
    value: undefined,
  });
  const getSnapshot = () => {
    const selected = selector(store.getState());
    const cache = snapshotRef.current;
    if (cache.hasValue && areSelectedValuesEqual(cache.value as T, selected)) {
      return cache.value as T;
    }
    cache.hasValue = true;
    cache.value = selected;
    return selected;
  };
  return useSyncExternalStore(
    store.subscribe,
    getSnapshot,
    getSnapshot,
  );
}

export function useSetAppState(): AppStore['setState'] {
  return useAppStore('useSetAppState').setState;
}
