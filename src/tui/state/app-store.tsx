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

function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppState must be used within <AppStateProvider>.');
  }
  return store;
}

export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useAppStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

export function useSetAppState(): AppStore['setState'] {
  return useAppStore().setState;
}
