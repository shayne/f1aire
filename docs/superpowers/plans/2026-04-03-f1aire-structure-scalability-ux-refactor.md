# f1aire Structure, Scalability, and UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `f1aire` into a more scalable, maintainable Ink app with a transcript-first engineer experience, lower render churn, cleaner input/scroll handling, and a stronger semantic UI system.

**Architecture:** Move root app state into a selector-based store, promote engineer conversation data from plain chat strings to a typed transcript event model, and route keyboard/mouse input through explicit keybinding contexts. Keep the copied Ink renderer, but simplify app code around stable shell primitives, semantic theme tokens, and memoized transcript rendering so the TUI stays responsive as sessions grow.

**Tech Stack:** TypeScript ESM, React, local `#ink` renderer under `src/vendor/ink`, Vitest, `ink-testing-library`, Node.js filesystem/runtime APIs, `ai` + `@ai-sdk/openai`.

---

## Scope Check

This plan intentionally spans five linked subsystems because they reinforce each other:

- app state ownership and route/runtime decomposition
- transcript data modeling and render performance
- keybinding + scroll/input routing
- semantic theming and screen-level shell consistency
- session persistence and regression guardrails

Each task is ordered so `main` remains shippable after every commit. If execution starts feeling too broad, split after Task 2: keep Tasks 3-4 as one engineer-surface plan, Task 5 as one theme-system plan, and Task 6 as one persistence plan.

## File Structure Map

- Create `src/tui/state/app-state.ts`
  - Owns the typed root UI state shape and default-state factory.
- Create `src/tui/state/app-store.tsx`
  - Provides `AppStateProvider`, `useAppState(selector)`, and `useSetAppState()` with `useSyncExternalStore`.
- Create `src/tui/state/app-store.test.tsx`
  - Verifies selector subscribers only re-render when their selected slice changes.
- Create `src/agent/transcript-events.ts`
  - Defines first-class transcript event types for user prompts, assistant text, tool lifecycle, and runtime errors.
- Create `src/tui/screens/engineer/transcript-model.ts`
  - Builds render rows from transcript events and exposes stable row IDs for memoized/virtualized rendering.
- Create `src/tui/screens/engineer/transcript-model.test.ts`
  - Verifies transcript event reduction and row generation.
- Create `src/tui/keybindings/actions.ts`
  - Declares action IDs, key contexts, and key-chord metadata.
- Create `src/tui/keybindings/use-keybindings.ts`
  - Routes key events through active contexts and returns stable handlers for screens/components.
- Create `src/tui/keybindings/use-keybindings.test.tsx`
  - Verifies context precedence and scroll/input routing.
- Create `src/tui/theme/tokens.ts`
  - Defines semantic UI tokens and default `f1aire` palettes.
- Create `src/tui/theme/provider.tsx`
  - Exposes `ThemeProvider`, `useTheme()`, and a single default theme object.
- Create `src/tui/theme/provider.test.tsx`
  - Verifies themed components receive semantic tokens without importing a flat singleton.
- Create `src/tui/screens/engineer/useVirtualTranscriptRows.ts`
  - Tracks a bounded visible window and memoizes transcript row metadata for long conversations.
- Create `src/tui/screens/engineer/useVirtualTranscriptRows.test.ts`
  - Verifies sticky-bottom behavior, scrollback windows, and stable row IDs.
- Create `src/agent/session-transcript-store.ts`
  - Persists and loads session transcript event logs outside the repo data directory.
- Create `src/agent/session-transcript-store.test.ts`
  - Verifies save/load behavior and schema fallback.
- Modify `src/app.tsx`
  - Shrinks from "all state + all side effects" into route composition plus small app hooks.
- Modify `src/app.test.ts`, `src/app-openai-key.test.tsx`, `src/app-engineer-shell.test.tsx`
  - Keep route and API-key behavior covered after the state-store extraction.
- Modify `src/agent/engineer.ts`
  - Emits structured transcript events and supports session hydration.
- Modify `src/tui/chat-state.ts`, `src/tui/chat-state.test.ts`
  - Becomes a compatibility adapter or is narrowed to user-input helpers around the new transcript model.
- Modify `src/tui/screens/EngineerChat.tsx`
  - Consumes transcript events, virtualized rows, theme tokens, and action-based keybindings.
- Modify `src/tui/screens/engineer/transcript-rows.ts`, `src/tui/screens/engineer/transcript-rows.test.ts`
  - Either becomes a thin adapter over `transcript-model.ts` or is folded into the new model.
- Modify `src/tui/screens/engineer/Composer.tsx`, `src/tui/screens/engineer/useComposerState.ts`, and existing composer tests
  - Integrates action-based scroll interception and keeps a stable, accessible prompt UI.
- Modify `src/tui/screens/engineer/TranscriptViewport.tsx`, `src/tui/screens/engineer/useEngineerScrollState.ts`, and related tests
  - Uses virtual row windows and explicit scroll actions.
- Modify `src/tui/components/Header.tsx`, `src/tui/components/Panel.tsx`, `src/tui/components/MenuList.tsx`, `src/tui/components/FooterHints.tsx`, and tests
  - Read semantic theme tokens and reduce duplicated ad hoc styling.
- Modify `src/tui/screens/SeasonPicker.tsx`, `src/tui/screens/MeetingPicker.tsx`, `src/tui/screens/SessionPicker.tsx`, `src/tui/screens/Settings.tsx`, `src/tui/screens/Summary.tsx`, `src/tui/screens/Downloading.tsx`, `src/tui/screens/ApiKeyPrompt.tsx`, `src/tui/screens/RuntimePreparing.tsx`
  - Align app-wide screens to one shared shell and semantic copy/layout rules.
- Modify `docs/`
  - Add one architecture note once the state, transcript, and keybinding boundaries are in place.

---

### Task 1: Introduce a Selector-Based App Store

**Files:**
- Create: `src/tui/state/app-state.ts`
- Create: `src/tui/state/app-store.tsx`
- Test: `src/tui/state/app-store.test.tsx`
- Modify: `src/app.tsx`
- Modify: `src/app.test.ts`

- [ ] **Step 1: Write the failing selector-store test**

Create `src/tui/state/app-store.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { Text } from '#ink';
import {
  AppStateProvider,
  createAppStore,
  useAppState,
} from './app-store.js';
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
  it('only re-renders subscribers whose selected slice changes', () => {
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

    expect(onScreenRender).toHaveBeenCalledTimes(0);
    expect(onStreamingRender).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the new test and verify the module is missing**

Run: `npm test -- src/tui/state/app-store.test.tsx`

Expected: `FAIL src/tui/state/app-store.test.tsx` with a module resolution error for `./app-store.js` and/or `./app-state.js`.

- [ ] **Step 3: Implement the store and selectors**

Create `src/tui/state/app-state.ts`:

```ts
import type { Summary as SummaryData } from '../../core/summary.js';
import type { TimeCursor } from '../../core/time-cursor.js';
import type { Screen } from '../navigation.js';
import type { ChatMessage } from '../chat-state.js';

export type RuntimeState = {
  ready: boolean;
  message: string;
  progress:
    | {
        phase: 'downloading' | 'extracting' | 'ready';
        downloadedBytes?: number;
        totalBytes?: number;
      }
    | null;
};

export type ApiKeyState = {
  storedApiKey: string | null;
  apiKeyError: string | null;
};

export type EngineerUiState = {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  streamStatus: string | null;
  activity: string[];
  pythonCodePreview: string;
  pythonCodeTarget: string;
  summary: SummaryData | null;
  timeCursor: TimeCursor;
};

export type AppState = {
  screen: Screen;
  runtime: RuntimeState;
  apiKey: ApiKeyState;
  engineer: EngineerUiState;
};

export function createInitialAppState(): AppState {
  return {
    screen: { name: 'season' },
    runtime: {
      ready: false,
      message: 'Checking Python runtime...',
      progress: null,
    },
    apiKey: {
      storedApiKey: null,
      apiKeyError: null,
    },
    engineer: {
      messages: [],
      streamingText: '',
      isStreaming: false,
      streamStatus: null,
      activity: [],
      pythonCodePreview: '',
      pythonCodeTarget: '',
      summary: null,
      timeCursor: { latest: true },
    },
  };
}
```

Create `src/tui/state/app-store.tsx`:

```tsx
import React, {
  createContext,
  useContext,
  useMemo,
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

export function createAppStore(initialState = createInitialAppState()): AppStore {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (update) => {
      const nextState = typeof update === 'function' ? update(state) : update;
      if (Object.is(nextState, state)) {
        return;
      }
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
    storeRef.current =
      store ?? createAppStore(initialState ?? createInitialAppState());
  }

  return (
    <AppStoreContext.Provider value={storeRef.current}>
      {children}
    </AppStoreContext.Provider>
  );
}

export function useAppState<T>(selector: (state: AppState) => T): T {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useAppState must be used inside AppStateProvider');
  }

  const stableSelector = useMemo(() => selector, [selector]);

  return useSyncExternalStore(
    store.subscribe,
    () => stableSelector(store.getState()),
    () => stableSelector(store.getState()),
  );
}

export function useSetAppState(): AppStore['setState'] {
  const store = useContext(AppStoreContext);
  if (!store) {
    throw new Error('useSetAppState must be used inside AppStateProvider');
  }
  return store.setState;
}
```

Modify `src/app.tsx` in the smallest possible first pass: move the current `App` body into an internal component and wrap that component with `AppStateProvider`. Do not change route behavior yet.

```tsx
import { AppStateProvider } from './tui/state/app-store.js';

function AppImpl(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });

  return (
    <Box flexDirection="column">
      <Header title="f1aire" />
      <SeasonPicker year={screen.year ?? new Date().getUTCFullYear()} />
    </Box>
  );
}

export function App(): React.JSX.Element {
  return (
    <AppStateProvider>
      <AppImpl />
    </AppStateProvider>
  );
}
```

- [ ] **Step 4: Run the store test and the existing app test**

Run: `npm test -- src/tui/state/app-store.test.tsx src/app.test.ts`

Expected: `PASS src/tui/state/app-store.test.tsx` and `PASS src/app.test.ts`.

- [ ] **Step 5: Commit the store boundary**

```bash
git add src/tui/state/app-state.ts src/tui/state/app-store.tsx src/tui/state/app-store.test.tsx src/app.tsx src/app.test.ts
git commit -m "refactor: introduce selector-based app state store"
```

---

### Task 2: Decompose Root App State and Side Effects into App Hooks

**Files:**
- Create: `src/tui/app/use-runtime-bootstrap.ts`
- Create: `src/tui/app/use-engineer-session.ts`
- Create: `src/tui/app/use-terminal-title-sync.ts`
- Test: `src/tui/app/use-runtime-bootstrap.test.tsx`
- Test: `src/tui/app/use-terminal-title-sync.test.tsx`
- Modify: `src/app.tsx`
- Modify: `src/app.test.ts`
- Modify: `src/app-openai-key.test.tsx`
- Modify: `src/app-engineer-shell.test.tsx`

- [ ] **Step 1: Write failing hook tests for runtime bootstrap and title sync**

Create `src/tui/app/use-terminal-title-sync.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useTerminalTitleSync } from './use-terminal-title-sync.js';

describe('useTerminalTitleSync', () => {
  it('writes a route-aware title through the injected writer', () => {
    const writeTitle = vi.fn();

    function Probe() {
      useTerminalTitleSync({
        screenName: 'engineer',
        isStreaming: true,
        summaryTitle: '2025 Monaco Grand Prix · Race',
        writeTitle,
      });
      return null;
    }

    render(<Probe />);

    expect(writeTitle).toHaveBeenCalledWith(
      expect.stringContaining('f1aire'),
    );
    expect(writeTitle).toHaveBeenCalledWith(
      expect.stringContaining('2025 Monaco Grand Prix · Race'),
    );
  });
});
```

Create `src/tui/app/use-runtime-bootstrap.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../state/app-store.js';
import { createInitialAppState } from '../state/app-state.js';
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
  return <>{runtimeMessage}</>;
}

describe('useRuntimeBootstrap', () => {
  it('stores runtime progress in the app store', async () => {
    const ensureRuntime = vi.fn(async ({ onProgress }) => {
      onProgress({ phase: 'extracting', message: 'Extracting Python runtime...' });
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
```

- [ ] **Step 2: Run the new hook tests and verify they fail**

Run: `npm test -- src/tui/app/use-terminal-title-sync.test.tsx src/tui/app/use-runtime-bootstrap.test.tsx`

Expected: `FAIL` because `use-terminal-title-sync.js` and `use-runtime-bootstrap.js` do not exist yet.

- [ ] **Step 3: Implement the app hooks and migrate one effect at a time out of `App`**

Create `src/tui/app/use-terminal-title-sync.ts`:

```ts
import { useEffect } from 'react';
import type { Screen } from '../navigation.js';
import {
  buildTerminalTitle,
  writeTerminalTitle,
} from '../terminal-chrome.js';

export function useTerminalTitleSync({
  screenName,
  isStreaming,
  summaryTitle,
  writeTitle = writeTerminalTitle,
}: {
  screenName: Screen['name'];
  isStreaming: boolean;
  summaryTitle?: string | null;
  writeTitle?: (title: string) => void;
}): void {
  useEffect(() => {
    writeTitle(
      buildTerminalTitle({
        screenName,
        summaryTitle,
        isStreaming,
      }),
    );
  }, [isStreaming, screenName, summaryTitle, writeTitle]);
}
```

Create `src/tui/app/use-runtime-bootstrap.ts`:

```ts
import { useEffect } from 'react';
import { useSetAppState } from '../state/app-store.js';

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
  downloadedBytes?: number;
  totalBytes?: number;
};

export function useRuntimeBootstrap({
  ensureRuntime,
}: {
  ensureRuntime: (args: {
    onProgress: (update: RuntimeProgressUpdate) => void;
  }) => Promise<void>;
}): void {
  const setAppState = useSetAppState();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setAppState((state) => ({
          ...state,
          runtime: {
            ...state.runtime,
            message: 'Preparing Python runtime...',
          },
        }));

        await ensureRuntime({
          onProgress: (update) => {
            if (cancelled) {
              return;
            }
            setAppState((state) => ({
              ...state,
              runtime: {
                ready: update.phase === 'ready',
                message: update.message,
                progress: {
                  phase: update.phase,
                  downloadedBytes: update.downloadedBytes,
                  totalBytes: update.totalBytes,
                },
              },
            }));
          },
        });

        if (!cancelled) {
          setAppState((state) => ({
            ...state,
            runtime: {
              ...state.runtime,
              ready: true,
            },
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setAppState((state) => ({
            ...state,
            runtime: {
              ready: false,
              message: `Python runtime failed: ${String(error)}`,
              progress: null,
            },
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureRuntime, setAppState]);
}
```

Create `src/tui/app/use-engineer-session.ts` by moving the engineer session refs, send loop, perf monitor, and tool-event handling out of `App` into one hook that reads `screen` and writes the `engineer` slice. Keep the public API narrow and start from this concrete shape:

```ts
import { useCallback, useRef } from 'react';
import { createEngineerSession } from '../../agent/engineer.js';
import { useSetAppState } from '../state/app-store.js';

type CreateSession = (args: {
  year: number;
  meetingKey: number;
  sessionKey: number;
  dir: string;
}) =>
  | ReturnType<typeof createEngineerSession>
  | Promise<ReturnType<typeof createEngineerSession>>;

export type EngineerSessionController = {
  handleSend: (text: string) => Promise<void>;
  ensureEngineerSession: (args: {
    year: number;
    meetingKey: number;
    sessionKey: number;
    dir: string;
  }) => Promise<void>;
};

export function useEngineerSession({
  createSession,
}: {
  createSession: CreateSession;
}): EngineerSessionController {
  const setAppState = useSetAppState();
  const engineerRef = useRef<ReturnType<typeof createEngineerSession> | null>(
    null,
  );

  const handleSend = useCallback(async (text: string) => {
    const session = engineerRef.current;
    if (!session) {
      return;
    }

    setAppState((state) => ({
      ...state,
      engineer: {
        ...state.engineer,
        isStreaming: true,
        streamStatus: 'Thinking...',
        streamingText: '',
        activity: ['Thinking...'],
      },
    }));

    let buffer = '';
    for await (const chunk of session.send(text)) {
      buffer += chunk;
      setAppState((state) => ({
        ...state,
        engineer: {
          ...state.engineer,
          streamingText: buffer,
        },
      }));
    }
  }, [setAppState]);

  const ensureEngineerSession = useCallback(
    async (args: {
      year: number;
      meetingKey: number;
      sessionKey: number;
      dir: string;
    }) => {
      if (engineerRef.current) {
        return;
      }

      engineerRef.current = await createSession(args);
    },
    [createSession],
  );

  return { handleSend, ensureEngineerSession };
}
```

Then reduce `src/app.tsx` to:

```tsx
function AppRoutes(): React.JSX.Element {
  const screen = useAppState((state) => state.screen);
  const runtimeReady = useAppState((state) => state.runtime.ready);
  const runtimeMessage = useAppState((state) => state.runtime.message);
  const runtimeProgress = useAppState((state) => state.runtime.progress);
  const engineer = useAppState((state) => state.engineer);
  const { handleSend, ensureEngineerSession } = useEngineerSession({
    createSession: async ({ dir }) => {
      const timingService = new TimingService();
      await hydrateTimingServiceFromStore(timingService, dir);

      return createEngineerSession({
        model: createOpenAI({ apiKey: effectiveApiKey ?? '' })('gpt-5.2'),
        tools: makeTools({
          timingService,
          getTimeCursor: () => engineer.timeCursor,
        }),
        system: systemPrompt({ summary: engineer.summary }),
        logger: engineerLoggerRef.current?.logger,
      });
    },
  });

  useRuntimeBootstrap({
    ensureRuntime: ({ onProgress }) =>
      ensurePyodideAssets({
        version: PYODIDE_VERSION,
        onProgress,
      }),
  });

  useTerminalTitleSync({
    screenName: screen.name,
    isStreaming: engineer.isStreaming,
    summaryTitle: engineer.summary
      ? `${engineer.summary.year} ${engineer.summary.meeting} · ${engineer.summary.session}`
      : null,
  });

  if (!runtimeReady) {
    return <RuntimePreparing message={runtimeMessage} progress={runtimeProgress} />;
  }

  if (screen.name === 'season') {
    return <SeasonPicker year={screen.year ?? new Date().getUTCFullYear()} />;
  }

  if (screen.name === 'engineer') {
    return (
      <EngineerChat
        messages={engineer.messages}
        onSend={handleSend}
        streamingText={engineer.streamingText}
        isStreaming={engineer.isStreaming}
        status={engineer.streamStatus}
        year={screen.year}
        meeting={screen.meeting}
        session={screen.session}
        summary={engineer.summary}
        activity={engineer.activity}
        pythonCode={engineer.pythonCodePreview}
      />
    );
  }

  return <Settings keyStatus={{ envKeyPresent: false, storedKeyPresent: false, inUse: 'none' }} configPath="" />;
}

export function App(): React.JSX.Element {
  return (
    <AppStateProvider>
      <AppRoutes />
    </AppStateProvider>
  );
}
```

- [ ] **Step 4: Run route, API-key, and engineer-shell tests**

Run: `npm test -- src/app.test.ts src/app-openai-key.test.tsx src/app-engineer-shell.test.tsx src/tui/app/use-terminal-title-sync.test.tsx src/tui/app/use-runtime-bootstrap.test.tsx`

Expected: all listed suites pass.

- [ ] **Step 5: Commit the root app decomposition**

```bash
git add src/app.tsx src/tui/app/use-runtime-bootstrap.ts src/tui/app/use-runtime-bootstrap.test.tsx src/tui/app/use-engineer-session.ts src/tui/app/use-terminal-title-sync.ts src/tui/app/use-terminal-title-sync.test.tsx src/app.test.ts src/app-openai-key.test.tsx src/app-engineer-shell.test.tsx
git commit -m "refactor: split root app side effects into focused hooks"
```

---

### Task 3: Promote Engineer Conversation Data to Typed Transcript Events

**Files:**
- Create: `src/agent/transcript-events.ts`
- Create: `src/tui/screens/engineer/transcript-model.ts`
- Test: `src/tui/screens/engineer/transcript-model.test.ts`
- Modify: `src/agent/engineer.ts`
- Modify: `src/tui/state/app-state.ts`
- Modify: `src/tui/chat-state.ts`
- Modify: `src/tui/chat-state.test.ts`
- Modify: `src/tui/screens/engineer/transcript-rows.ts`
- Modify: `src/tui/screens/engineer/transcript-rows.test.ts`

- [ ] **Step 1: Write failing tests for transcript events and row mapping**

Create `src/tui/screens/engineer/transcript-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '../../../agent/transcript-events.js';
import { buildTranscriptModel } from './transcript-model.js';

describe('buildTranscriptModel', () => {
  it('preserves tool lifecycle and streaming assistant text as first-class rows', () => {
    const events: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Compare Verstappen and Norris race pace.',
      },
      {
        id: 'tool-1',
        type: 'tool-call',
        toolName: 'compare_lap_times',
        label: 'Comparing lap time deltas',
      },
      {
        id: 'tool-1-result',
        type: 'tool-result',
        toolName: 'compare_lap_times',
        label: 'Lap comparison ready',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Verstappen’s median pace was 0.18s stronger on the medium stint.',
        streaming: false,
      },
    ];

    const model = buildTranscriptModel({
      events,
      messageWidth: 72,
    });

    expect(model.rows.map((row) => row.kind)).toEqual([
      'message',
      'tool',
      'tool',
      'message',
    ]);
    expect(model.rows[1]).toMatchObject({
      id: 'tool-1',
      role: 'tool',
      label: 'Comparing lap time deltas',
    });
    expect(model.version).toContain('tool-1-result');
  });
});
```

- [ ] **Step 2: Run the model test and verify the new modules are missing**

Run: `npm test -- src/tui/screens/engineer/transcript-model.test.ts`

Expected: `FAIL src/tui/screens/engineer/transcript-model.test.ts` with a missing module error for `../../../agent/transcript-events.js` or `./transcript-model.js`.

- [ ] **Step 3: Implement transcript event types and a render model**

Create `src/agent/transcript-events.ts`:

```ts
export type UserMessageEvent = {
  id: string;
  type: 'user-message';
  text: string;
};

export type AssistantMessageEvent = {
  id: string;
  type: 'assistant-message';
  text: string;
  streaming: boolean;
};

export type ToolCallEvent = {
  id: string;
  type: 'tool-call';
  toolName: string;
  label: string;
};

export type ToolResultEvent = {
  id: string;
  type: 'tool-result';
  toolName: string;
  label: string;
  error?: string;
};

export type TranscriptEvent =
  | UserMessageEvent
  | AssistantMessageEvent
  | ToolCallEvent
  | ToolResultEvent;
```

Create `src/tui/screens/engineer/transcript-model.ts`:

```ts
import wrapAnsi from 'wrap-ansi';
import type { TranscriptEvent } from '../../../agent/transcript-events.js';

export type TranscriptRow =
  | {
      id: string;
      kind: 'message';
      role: 'user' | 'assistant';
      lines: string[];
      streaming?: boolean;
    }
  | {
      id: string;
      kind: 'tool';
      role: 'tool';
      label: string;
      toolName: string;
      error?: string;
    };

export function buildTranscriptModel({
  events,
  messageWidth,
}: {
  events: TranscriptEvent[];
  messageWidth: number;
}): {
  rows: TranscriptRow[];
  version: string;
} {
  return {
    rows: events.map((event) => {
      if (event.type === 'user-message') {
        return {
          id: event.id,
          kind: 'message',
          role: 'user',
          lines: wrapAnsi(event.text, messageWidth, { hard: true }).split('\n'),
        };
      }

      if (event.type === 'assistant-message') {
        return {
          id: event.id,
          kind: 'message',
          role: 'assistant',
          lines: wrapAnsi(event.text, messageWidth, { hard: true }).split('\n'),
          streaming: event.streaming,
        };
      }

      return {
        id: event.id,
        kind: 'tool',
        role: 'tool',
        label: event.label,
        toolName: event.toolName,
        error: event.type === 'tool-result' ? event.error : undefined,
      };
    }),
    version: events
      .map((event) => `${event.id}:${event.type}`)
      .join('\u0001'),
  };
}
```

Modify `src/agent/engineer.ts` so `send()` emits stable event IDs and accepts an optional hydrated event history. Keep the existing streaming generator API, but expose a transcript accessor:

```ts
import type { TranscriptEvent } from './transcript-events.js';

export function createEngineerSession({
  model,
  tools,
  system,
  streamTextFn = streamText,
  logger,
  onEvent,
  initialTranscript = [],
}: CreateEngineerSessionArgs & {
  initialTranscript?: TranscriptEvent[];
}) {
  const transcriptEvents = [...initialTranscript];

  return {
    getTranscriptEvents() {
      return transcriptEvents;
    },
    async *send(input: string) {
      const userEventId = `user-${Date.now()}`;
      transcriptEvents.push({
        id: userEventId,
        type: 'user-message',
        text: input,
      });

      const assistantEventId = `assistant-${Date.now()}`;
      transcriptEvents.push({
        id: assistantEventId,
        type: 'assistant-message',
        text: '',
        streaming: true,
      });

      const result = await streamTextFn({
        model,
        system,
        messages: transcriptEvents
          .filter((event) => event.type === 'user-message' || event.type === 'assistant-message')
          .map((event) => ({
            role: event.type === 'user-message' ? 'user' : 'assistant',
            content: event.text,
          })),
        tools,
        stopWhen: stepCountIs(8),
      });

      let buffer = '';
      for await (const part of result.fullStream) {
        if (part.type === 'tool-call') {
          transcriptEvents.push({
            id: part.toolCallId,
            type: 'tool-call',
            toolName: getToolName(part) ?? 'tool',
            label: `Running ${getToolName(part) ?? 'tool'}`,
          });
        }

        if (part.type === 'tool-result') {
          transcriptEvents.push({
            id: `${part.toolCallId}-result`,
            type: 'tool-result',
            toolName: getToolName(part) ?? 'tool',
            label: `${getToolName(part) ?? 'Tool'} complete`,
          });
        }

        if (part.type === 'text-delta') {
          buffer += part.text;
          transcriptEvents[transcriptEvents.length - 1] = {
            id: assistantEventId,
            type: 'assistant-message',
            text: buffer,
            streaming: true,
          };
          yield part.text;
        }
      }

      transcriptEvents[transcriptEvents.length - 1] = {
        id: assistantEventId,
        type: 'assistant-message',
        text: buffer,
        streaming: false,
      };
    },
  };
}
```

Modify `src/tui/chat-state.ts` so it becomes a thin compatibility helper around user prompt submission, not the source of transcript truth. If it still exports `ChatMessage`, mark that type as legacy and keep tests green during the transition.

```ts
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function appendUserMessage(
  messages: ChatMessage[],
  content: string,
): ChatMessage[] {
  if (!content.trim()) {
    return messages;
  }

  return [...messages, { role: 'user', content }];
}
```

Modify `src/tui/state/app-state.ts` so the engineer slice can carry the new transcript events alongside the legacy message array during migration:

```ts
import type { TranscriptEvent } from '../../agent/transcript-events.js';

export type EngineerUiState = {
  messages: ChatMessage[];
  transcriptEvents: TranscriptEvent[];
  streamingText: string;
  isStreaming: boolean;
  streamStatus: string | null;
  activity: string[];
  pythonCodePreview: string;
  pythonCodeTarget: string;
  summary: SummaryData | null;
  timeCursor: TimeCursor;
};
```

- [ ] **Step 4: Run transcript and chat-state tests**

Run: `npm test -- src/tui/screens/engineer/transcript-model.test.ts src/tui/screens/engineer/transcript-rows.test.ts src/tui/chat-state.test.ts`

Expected: all listed suites pass.

- [ ] **Step 5: Commit the transcript event model**

```bash
git add src/agent/transcript-events.ts src/agent/engineer.ts src/tui/chat-state.ts src/tui/chat-state.test.ts src/tui/screens/engineer/transcript-model.ts src/tui/screens/engineer/transcript-model.test.ts src/tui/screens/engineer/transcript-rows.ts src/tui/screens/engineer/transcript-rows.test.ts
git commit -m "refactor: model engineer transcript as typed events"
```

---

### Task 4: Virtualize Transcript Rendering and Eliminate O(n) Rebuilds on Every Stream Tick

**Files:**
- Create: `src/tui/screens/engineer/useVirtualTranscriptRows.ts`
- Test: `src/tui/screens/engineer/useVirtualTranscriptRows.test.ts`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/engineer/TranscriptViewport.tsx`
- Modify: `src/tui/screens/engineer/useEngineerScrollState.ts`
- Modify: `src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`
- Modify: `src/tui/screens/engineer/TranscriptViewport.test.tsx`

- [ ] **Step 1: Write a failing virtual-window test**

Create `src/tui/screens/engineer/useVirtualTranscriptRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TranscriptRow } from './transcript-model.js';
import { getVirtualTranscriptWindow } from './useVirtualTranscriptRows.js';

function rows(count: number): TranscriptRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    kind: 'message',
    role: index % 2 === 0 ? 'user' : 'assistant',
    lines: [`row ${index}`],
  }));
}

describe('getVirtualTranscriptWindow', () => {
  it('returns a bounded slice plus top/bottom spacer counts', () => {
    const window = getVirtualTranscriptWindow({
      rows: rows(200),
      viewportRows: 12,
      scrollOffset: 30,
      overscan: 4,
    });

    expect(window.visibleRows[0]?.id).toBe('row-26');
    expect(window.visibleRows.at(-1)?.id).toBe('row-45');
    expect(window.topSpacerRows).toBe(26);
    expect(window.bottomSpacerRows).toBe(154);
  });
});
```

- [ ] **Step 2: Run the new virtual-window test and verify it fails**

Run: `npm test -- src/tui/screens/engineer/useVirtualTranscriptRows.test.ts`

Expected: `FAIL src/tui/screens/engineer/useVirtualTranscriptRows.test.ts` with a missing export for `getVirtualTranscriptWindow`.

- [ ] **Step 3: Implement the virtual transcript window and consume it from `EngineerChat`**

Create `src/tui/screens/engineer/useVirtualTranscriptRows.ts`:

```ts
import { useMemo } from 'react';
import type { TranscriptRow } from './transcript-model.js';

export type VirtualTranscriptWindow = {
  visibleRows: TranscriptRow[];
  topSpacerRows: number;
  bottomSpacerRows: number;
};

export function getVirtualTranscriptWindow({
  rows,
  viewportRows,
  scrollOffset,
  overscan,
}: {
  rows: TranscriptRow[];
  viewportRows: number;
  scrollOffset: number;
  overscan: number;
}): VirtualTranscriptWindow {
  const start = Math.max(0, scrollOffset - overscan);
  const end = Math.min(rows.length, scrollOffset + viewportRows + overscan);

  return {
    visibleRows: rows.slice(start, end),
    topSpacerRows: start,
    bottomSpacerRows: rows.length - end,
  };
}

export function useVirtualTranscriptRows(args: {
  rows: TranscriptRow[];
  viewportRows: number;
  scrollOffset: number;
  overscan?: number;
}): VirtualTranscriptWindow {
  const overscan = args.overscan ?? 8;

  return useMemo(
    () =>
      getVirtualTranscriptWindow({
        rows: args.rows,
        viewportRows: args.viewportRows,
        scrollOffset: args.scrollOffset,
        overscan,
      }),
    [args.rows, args.viewportRows, args.scrollOffset, overscan],
  );
}
```

Modify `src/tui/screens/EngineerChat.tsx` so it memoizes `buildTranscriptModel(...)`, passes a row count/viewport height into `useEngineerScrollState`, then passes only the virtual window into `TranscriptViewport`:

```tsx
const transcriptModel = useMemo(
  () =>
    buildTranscriptModel({
      events: transcriptEvents,
      messageWidth: messageContentWidth,
    }),
  [messageContentWidth, transcriptEvents],
);

const { scrollOffset, ...scrollState } = useEngineerScrollState({
  rowCount: transcriptModel.rows.length,
  transcriptVersion: transcriptModel.version,
});

const transcriptWindow = useVirtualTranscriptRows({
  rows: transcriptModel.rows,
  viewportRows: rows - 8,
  scrollOffset,
});
```

Modify `src/tui/screens/engineer/TranscriptViewport.tsx` so it renders `topSpacerRows` and `bottomSpacerRows` as height-only `Box` blocks around the visible row list. Keep the existing scroll hint row untouched:

```tsx
export function TranscriptViewport({
  rows,
  topSpacerRows,
  bottomSpacerRows,
  scrollHint,
}: {
  rows: TranscriptRow[];
  topSpacerRows: number;
  bottomSpacerRows: number;
  scrollHint: string | null;
}) {
  return (
    <Box flexDirection="column">
      {topSpacerRows > 0 ? <Box height={topSpacerRows} /> : null}
      {rows.map((row) => (
        <TranscriptRowView key={row.id} row={row} />
      ))}
      {bottomSpacerRows > 0 ? <Box height={bottomSpacerRows} /> : null}
      {scrollHint ? <Text dimColor>{scrollHint}</Text> : null}
    </Box>
  );
}
```

Modify `src/tui/screens/engineer/useEngineerScrollState.ts` so it stores `scrollOffset` as a row index instead of coupling behavior to full-string transcript joins. Keep sticky-bottom behavior when `isAtBottom` is true and new rows arrive:

```ts
const [scrollOffset, setScrollOffset] = useState(0);

useEffect(() => {
  if (!isAtBottomRef.current) {
    return;
  }
  setScrollOffset(Math.max(0, rowCount - viewportRows));
}, [rowCount, viewportRows, transcriptVersion]);
```

- [ ] **Step 4: Run transcript scroll and viewport tests**

Run: `npm test -- src/tui/screens/engineer/useVirtualTranscriptRows.test.ts src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx src/tui/screens/engineer/TranscriptViewport.test.tsx`

Expected: all listed suites pass.

- [ ] **Step 5: Commit transcript virtualization**

```bash
git add src/tui/screens/engineer/useVirtualTranscriptRows.ts src/tui/screens/engineer/useVirtualTranscriptRows.test.ts src/tui/screens/EngineerChat.tsx src/tui/screens/engineer/TranscriptViewport.tsx src/tui/screens/engineer/useEngineerScrollState.ts src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx src/tui/screens/engineer/TranscriptViewport.test.tsx
git commit -m "perf: virtualize engineer transcript rows"
```

---

### Task 5: Add Action-Based Keybinding Contexts for Scroll, Composer, and Global Navigation

**Files:**
- Create: `src/tui/keybindings/actions.ts`
- Create: `src/tui/keybindings/use-keybindings.ts`
- Test: `src/tui/keybindings/use-keybindings.test.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/engineer/Composer.tsx`
- Modify: `src/tui/screens/engineer/useComposerState.ts`
- Modify: `src/app.tsx`
- Modify: existing composer and engineer scroll tests

- [ ] **Step 1: Write a failing keybinding-context test**

Create `src/tui/keybindings/use-keybindings.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { useKeybindings } from './use-keybindings.js';
import type { Keybinding } from './actions.js';

function Harness({
  bindings,
}: {
  bindings: Keybinding[];
}): React.JSX.Element | null {
  useKeybindings({
    activeContexts: ['engineer', 'transcript'],
    bindings,
  });
  return null;
}

describe('useKeybindings', () => {
  it('prefers the most specific active context for page scroll actions', () => {
    const onGlobal = vi.fn();
    const onTranscript = vi.fn();

    const { stdin } = render(
      <Harness
        bindings={[
          {
            action: 'global.back',
            context: 'global',
            key: { escape: true },
            run: onGlobal,
          },
          {
            action: 'transcript.pageUp',
            context: 'transcript',
            key: { pageUp: true },
            run: onTranscript,
          },
        ]}
      />,
    );

    stdin.write('\u001b[5~');

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onGlobal).toHaveBeenCalledTimes(0);
  });
});
```

- [ ] **Step 2: Run the keybinding test and verify it fails**

Run: `npm test -- src/tui/keybindings/use-keybindings.test.tsx`

Expected: `FAIL src/tui/keybindings/use-keybindings.test.tsx` because `./use-keybindings.js` and `./actions.js` do not exist.

- [ ] **Step 3: Implement keybinding descriptors and the routing hook**

Create `src/tui/keybindings/actions.ts`:

```ts
import type { Key } from '#ink';

export type KeybindingContext =
  | 'global'
  | 'picker'
  | 'engineer'
  | 'composer'
  | 'transcript';

export type KeyActionId =
  | 'global.back'
  | 'global.quit'
  | 'picker.moveUp'
  | 'picker.moveDown'
  | 'picker.select'
  | 'engineer.toggleDetails'
  | 'transcript.pageUp'
  | 'transcript.pageDown'
  | 'transcript.wheelUp'
  | 'transcript.wheelDown'
  | 'transcript.jumpToLatest'
  | 'composer.submit';

export type Keybinding = {
  action: KeyActionId;
  context: KeybindingContext;
  key: Partial<Key> & { input?: string };
  run: () => boolean | void;
};

export function keyMatches(bindingKey: Keybinding['key'], input: string, key: Key): boolean {
  if (bindingKey.input !== undefined && bindingKey.input !== input) {
    return false;
  }

  for (const [name, expected] of Object.entries(bindingKey)) {
    if (name === 'input') {
      continue;
    }
    if ((key as Record<string, unknown>)[name] !== expected) {
      return false;
    }
  }

  return true;
}
```

Create `src/tui/keybindings/use-keybindings.ts`:

```ts
import { useMemo } from 'react';
import { useInput } from '#ink';
import type { Keybinding, KeybindingContext } from './actions.js';
import { keyMatches } from './actions.js';

const contextPriority: Record<KeybindingContext, number> = {
  global: 0,
  picker: 1,
  engineer: 2,
  transcript: 3,
  composer: 4,
};

export function useKeybindings({
  activeContexts,
  bindings,
  isActive = true,
}: {
  activeContexts: KeybindingContext[];
  bindings: Keybinding[];
  isActive?: boolean;
}): void {
  const orderedBindings = useMemo(
    () =>
      bindings
        .filter((binding) => activeContexts.includes(binding.context))
        .sort(
          (left, right) =>
            contextPriority[right.context] - contextPriority[left.context],
        ),
    [activeContexts, bindings],
  );

  useInput((input, key) => {
    for (const binding of orderedBindings) {
      if (!keyMatches(binding.key, input, key)) {
        continue;
      }

      const handled = binding.run();
      if (handled !== false) {
        return;
      }
    }
  }, { isActive });
}
```

Modify `src/tui/screens/EngineerChat.tsx` to replace manual `handleComposerIntercept` branching with explicit bindings:

```ts
useKeybindings({
  activeContexts: ['engineer', 'transcript'],
  bindings: [
    { action: 'transcript.pageUp', context: 'transcript', key: { pageUp: true }, run: handlePageUp },
    { action: 'transcript.pageDown', context: 'transcript', key: { pageDown: true }, run: handlePageDown },
    { action: 'transcript.wheelUp', context: 'transcript', key: { wheelUp: true }, run: handleWheelUp },
    { action: 'transcript.wheelDown', context: 'transcript', key: { wheelDown: true }, run: handleWheelDown },
    {
      action: 'engineer.toggleDetails',
      context: 'engineer',
      key: { tab: true },
      run: () => {
        setDetailsExpanded((current) => !current);
      },
    },
  ],
});
```

Modify `src/tui/screens/engineer/Composer.tsx` and `useComposerState.ts` so composer submit remains component-local, while transcript scroll keys are no longer tunneled through a generic `onInterceptInput` prop:

```tsx
export function Composer({
  state,
  width,
}: {
  state: ComposerState;
  width: number;
}) {
  useKeybindings({
    activeContexts: ['composer'],
    bindings: [
      {
        action: 'composer.submit',
        context: 'composer',
        key: { return: true },
        run: () => {
          state.submit();
        },
      },
    ],
    isActive: !state.isStreaming,
  });

  return <Box width={width}>{state.renderedLines}</Box>;
}
```

- [ ] **Step 4: Run keybinding, composer, and engineer scroll tests**

Run: `npm test -- src/tui/keybindings/use-keybindings.test.tsx src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/useComposerState.test.ts src/tui/screens/EngineerChat.test.tsx`

Expected: all listed suites pass.

- [ ] **Step 5: Commit keybinding contexts**

```bash
git add src/tui/keybindings/actions.ts src/tui/keybindings/use-keybindings.ts src/tui/keybindings/use-keybindings.test.tsx src/tui/screens/EngineerChat.tsx src/tui/screens/engineer/Composer.tsx src/tui/screens/engineer/useComposerState.ts src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/useComposerState.test.ts src/tui/screens/EngineerChat.test.tsx src/app.tsx
git commit -m "refactor: route tui input through keybinding contexts"
```

---

### Task 6: Replace the Flat Theme Singleton with Semantic Theme Tokens and a Provider

**Files:**
- Create: `src/tui/theme/tokens.ts`
- Create: `src/tui/theme/provider.tsx`
- Test: `src/tui/theme/provider.test.tsx`
- Modify: `src/tui/theme.ts`
- Modify: `src/tui/components/Header.tsx`
- Modify: `src/tui/components/Panel.tsx`
- Modify: `src/tui/components/MenuList.tsx`
- Modify: `src/tui/components/FooterHints.tsx`
- Modify: `src/tui/screens/engineer/EngineerStatusRow.tsx`
- Modify: `src/tui/screens/engineer/EngineerShimmerMessage.tsx`
- Modify: all corresponding component tests

- [ ] **Step 1: Write a failing theme-provider test**

Create `src/tui/theme/provider.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { Text } from '#ink';
import { ThemeProvider, useTheme } from './provider.js';
import { darkTheme } from './tokens.js';

function Probe() {
  const theme = useTheme();
  return <Text color={theme.text.brand}>{theme.name}</Text>;
}

describe('ThemeProvider', () => {
  it('exposes semantic color tokens to child components', () => {
    const { lastFrame } = render(
      <ThemeProvider value={darkTheme}>
        <Probe />
      </ThemeProvider>,
    );

    expect(lastFrame()).toContain('dark');
  });
});
```

- [ ] **Step 2: Run the theme-provider test and verify it fails**

Run: `npm test -- src/tui/theme/provider.test.tsx`

Expected: `FAIL src/tui/theme/provider.test.tsx` because `./provider.js` and `./tokens.js` are not implemented.

- [ ] **Step 3: Implement semantic theme tokens and migrate components off direct singleton reads**

Create `src/tui/theme/tokens.ts`:

```ts
export type F1aireTheme = {
  name: 'dark';
  text: {
    primary: string;
    secondary: string;
    muted: string;
    brand: string;
    user: string;
    assistant: string;
  };
  border: {
    subtle: string;
    strong: string;
  };
  status: {
    thinking: string;
    thinkingShimmer: string;
    tool: string;
    toolShimmer: string;
    error: string;
    errorShimmer: string;
    ok: string;
  };
};

export const darkTheme: F1aireTheme = {
  name: 'dark',
  text: {
    primary: 'rgb(255,255,255)',
    secondary: 'rgb(220,220,220)',
    muted: 'rgb(153,153,153)',
    brand: 'rgb(215,119,87)',
    user: 'rgb(122,180,232)',
    assistant: 'rgb(215,119,87)',
  },
  border: {
    subtle: 'rgb(136,136,136)',
    strong: 'rgb(220,220,220)',
  },
  status: {
    thinking: 'rgb(215,119,87)',
    thinkingShimmer: 'rgb(235,159,127)',
    tool: 'rgb(122,180,232)',
    toolShimmer: 'rgb(183,224,255)',
    error: 'rgb(255,107,128)',
    errorShimmer: 'rgb(255,145,162)',
    ok: 'rgb(78,186,101)',
  },
};
```

Create `src/tui/theme/provider.tsx`:

```tsx
import React, { createContext, useContext } from 'react';
import { darkTheme, type F1aireTheme } from './tokens.js';

const ThemeContext = createContext<F1aireTheme>(darkTheme);

export function ThemeProvider({
  value = darkTheme,
  children,
}: {
  value?: F1aireTheme;
  children: React.ReactNode;
}): React.JSX.Element {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): F1aireTheme {
  return useContext(ThemeContext);
}
```

Modify `src/tui/theme.ts` so it remains a compatibility export while new components migrate:

```ts
import { darkTheme } from './theme/tokens.js';

export const theme = {
  brand: darkTheme.text.brand,
  accent: darkTheme.text.user,
  text: darkTheme.text.primary,
  muted: darkTheme.text.muted,
  subtle: darkTheme.text.muted,
  border: darkTheme.border.subtle,
  panelTitle: darkTheme.text.secondary,
  user: darkTheme.text.user,
  assistant: darkTheme.text.assistant,
  assistantShimmer: darkTheme.status.thinkingShimmer,
  status: darkTheme.status,
} as const;
```

Update components incrementally to call `useTheme()` instead of importing `theme` directly. Start with `Header`, `Panel`, `MenuList`, `FooterHints`, and engineer status/shimmer components:

```tsx
import { useTheme } from '../theme/provider.js';

export function Header({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <Text color={theme.text.brand}>
      {title}
    </Text>
  );
}
```

- [ ] **Step 4: Run component and theme tests**

Run: `npm test -- src/tui/theme/provider.test.tsx src/tui/components/Header.test.tsx src/tui/components/Panel.test.tsx src/tui/components/MenuList.test.tsx src/tui/components/FooterHints.test.tsx src/tui/screens/engineer/EngineerStatusRow.test.tsx src/tui/screens/engineer/EngineerShimmerMessage.test.tsx`

Expected: all listed suites pass.

- [ ] **Step 5: Commit the theme provider migration**

```bash
git add src/tui/theme/tokens.ts src/tui/theme/provider.tsx src/tui/theme/provider.test.tsx src/tui/theme.ts src/tui/components/Header.tsx src/tui/components/Panel.tsx src/tui/components/MenuList.tsx src/tui/components/FooterHints.tsx src/tui/screens/engineer/EngineerStatusRow.tsx src/tui/screens/engineer/EngineerShimmerMessage.tsx src/tui/components/Header.test.tsx src/tui/components/Panel.test.tsx src/tui/components/MenuList.test.tsx src/tui/components/FooterHints.test.tsx src/tui/screens/engineer/EngineerStatusRow.test.tsx src/tui/screens/engineer/EngineerShimmerMessage.test.tsx
git commit -m "ux: introduce semantic tui theme provider"
```

---

### Task 7: Unify Non-Engineer Screens Around One Shell and First-Run Brand/Instruction Pattern

**Files:**
- Modify: `src/tui/components/ScreenLayout.tsx`
- Modify: `src/tui/screens/SeasonPicker.tsx`
- Modify: `src/tui/screens/MeetingPicker.tsx`
- Modify: `src/tui/screens/SessionPicker.tsx`
- Modify: `src/tui/screens/Settings.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.tsx`
- Modify: `src/tui/screens/RuntimePreparing.tsx`
- Modify: `src/tui/screens/Downloading.tsx`
- Modify: `src/tui/screens/Summary.tsx`
- Modify: `src/tui/components/ScreenLayout.test.tsx`
- Modify: `src/app.test.ts`

- [ ] **Step 1: Write failing layout tests for narrow and wide terminals**

Extend `src/tui/components/ScreenLayout.test.tsx` with two explicit cases:

```tsx
it('keeps the primary pane visible and stacks details on narrow terminals', () => {
  const { lastFrame } = render(
    <ScreenLayout
      columns={72}
      title="f1aire"
      subtitle="AI race engineer"
      primary={<Text>Season picker</Text>}
      details={<Text>Season details</Text>}
    />,
  );

  const frame = lastFrame() ?? '';
  expect(frame).toContain('Season picker');
  expect(frame).toContain('Season details');
  expect(frame.indexOf('Season picker')).toBeLessThan(
    frame.indexOf('Season details'),
  );
});

it('renders primary and details in one row on wide terminals', () => {
  const { lastFrame } = render(
    <ScreenLayout
      columns={120}
      title="f1aire"
      subtitle="AI race engineer"
      primary={<Text>Season picker</Text>}
      details={<Text>Season details</Text>}
    />,
  );

  const frame = lastFrame() ?? '';
  expect(frame).toContain('Season picker');
  expect(frame).toContain('Season details');
});
```

- [ ] **Step 2: Run the layout test and verify it fails if the current shell is too rigid**

Run: `npm test -- src/tui/components/ScreenLayout.test.tsx`

Expected: `FAIL` if `ScreenLayout` does not yet expose the `title`, `subtitle`, `primary`, and `details` contract shown above, or if narrow stacking is not implemented.

- [ ] **Step 3: Refactor `ScreenLayout` and move picker/settings screens onto it**

Target `ScreenLayout` API:

```tsx
export function ScreenLayout({
  columns,
  title,
  subtitle,
  primary,
  details,
  footer,
}: {
  columns: number;
  title: string;
  subtitle: string;
  primary: React.ReactNode;
  details?: React.ReactNode;
  footer?: React.ReactNode;
}): React.JSX.Element {
  const theme = useTheme();
  const stacked = columns < 88;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color={theme.text.brand}>{title}</Text>
        <Text color={theme.text.muted}> · {subtitle}</Text>
      </Box>

      <Box flexDirection={stacked ? 'column' : 'row'} gap={1}>
        <Box flexGrow={1}>{primary}</Box>
        {details ? (
          <Box width={stacked ? undefined : 44}>{details}</Box>
        ) : null}
      </Box>

      {footer ? <Box marginTop={1}>{footer}</Box> : null}
    </Box>
  );
}
```

Then update each non-engineer screen so:

- launch/selection screens state the product identity clearly once
- hints are short and do not wrap into multi-line key soup
- detail copy is contextual, not duplicate instructions
- narrow terminals stack instead of truncating or crowding columns

Keep the engineer screen on `EngineerShell`; do not force it through `ScreenLayout`.

Concrete migration shape for one picker screen:

```tsx
export function SeasonPicker({
  years,
  selectedYear,
  onSelect,
}: {
  years: number[];
  selectedYear: number;
  onSelect: (year: number) => void;
}) {
  const { columns = 100 } = useTerminalSize();

  return (
    <ScreenLayout
      columns={columns}
      title="f1aire"
      subtitle="AI race engineer for live timing and session analysis"
      primary={
        <MenuList
          items={years.map((year) => ({ key: String(year), label: String(year) }))}
          selectedKey={String(selectedYear)}
          onSelect={(key) => onSelect(Number(key))}
        />
      }
      details={
        <Panel title="Season">
          <Text dimColor>Pick a championship year to start race analysis.</Text>
        </Panel>
      }
    />
  );
}
```

- [ ] **Step 4: Run screen and app tests**

Run: `npm test -- src/tui/components/ScreenLayout.test.tsx src/app.test.ts`

Expected: both suites pass.

- [ ] **Step 5: Commit the app-wide shell cleanup**

```bash
git add src/tui/components/ScreenLayout.tsx src/tui/components/ScreenLayout.test.tsx src/tui/screens/SeasonPicker.tsx src/tui/screens/MeetingPicker.tsx src/tui/screens/SessionPicker.tsx src/tui/screens/Settings.tsx src/tui/screens/ApiKeyPrompt.tsx src/tui/screens/RuntimePreparing.tsx src/tui/screens/Downloading.tsx src/tui/screens/Summary.tsx src/app.test.ts
git commit -m "ux: unify non-engineer screens around one shell"
```

---

### Task 8: Persist Engineer Transcript Sessions and Add Resume UX

**Files:**
- Create: `src/agent/session-transcript-store.ts`
- Test: `src/agent/session-transcript-store.test.ts`
- Modify: `src/agent/engineer.ts`
- Modify: `src/tui/app/use-engineer-session.ts`
- Modify: `src/tui/screens/Settings.tsx`
- Modify: `src/tui/screens/Summary.tsx`
- Modify: `src/app.test.ts`

- [ ] **Step 1: Write a failing persistence test**

Create `src/agent/session-transcript-store.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  loadTranscriptEvents,
  saveTranscriptEvents,
} from './session-transcript-store.js';
import type { TranscriptEvent } from './transcript-events.js';

describe('session-transcript-store', () => {
  it('round-trips transcript events for one session', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));
    const events: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'What was Ferrari’s long-run degradation?',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Leclerc degraded by roughly 0.08s/lap over the stint.',
        streaming: false,
      },
    ];

    await saveTranscriptEvents({
      dataDir: dir,
      sessionKey: '2025-11-24-race',
      events,
    });

    await expect(
      loadTranscriptEvents({
        dataDir: dir,
        sessionKey: '2025-11-24-race',
      }),
    ).resolves.toEqual(events);

    const raw = await readFile(
      path.join(dir, 'transcripts', '2025-11-24-race.json'),
      'utf-8',
    );
    expect(raw).toContain('Ferrari');
  });
});
```

- [ ] **Step 2: Run the persistence test and verify it fails**

Run: `npm test -- src/agent/session-transcript-store.test.ts`

Expected: `FAIL src/agent/session-transcript-store.test.ts` because `./session-transcript-store.js` is missing.

- [ ] **Step 3: Implement transcript save/load and hydrate engineer sessions**

Create `src/agent/session-transcript-store.ts`:

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptEvent } from './transcript-events.js';

function getTranscriptPath({
  dataDir,
  sessionKey,
}: {
  dataDir: string;
  sessionKey: string;
}): string {
  return path.join(dataDir, 'transcripts', `${sessionKey}.json`);
}

export async function saveTranscriptEvents({
  dataDir,
  sessionKey,
  events,
}: {
  dataDir: string;
  sessionKey: string;
  events: TranscriptEvent[];
}): Promise<void> {
  const filePath = getTranscriptPath({ dataDir, sessionKey });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(events, null, 2)}\n`, 'utf-8');
}

export async function loadTranscriptEvents({
  dataDir,
  sessionKey,
}: {
  dataDir: string;
  sessionKey: string;
}): Promise<TranscriptEvent[]> {
  try {
    const filePath = getTranscriptPath({ dataDir, sessionKey });
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as TranscriptEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
```

Modify `src/tui/app/use-engineer-session.ts` so `ensureEngineerSession(...)` loads existing transcript events before creating the session and saves updated events after each successful turn. Use a stable session key such as `${year}-${meetingKey}-${sessionKey}` and keep files under `getDataDir('f1aire')/transcripts/`:

```ts
const sessionKeyRef = useRef<string | null>(null);

const ensureEngineerSession = useCallback(async ({
  year,
  meetingKey,
  sessionKey,
  dir,
}: {
  year: number;
  meetingKey: number;
  sessionKey: number;
  dir: string;
}) => {
  const transcriptSessionKey = `${year}-${meetingKey}-${sessionKey}`;
  sessionKeyRef.current = transcriptSessionKey;

  const initialTranscript = await loadTranscriptEvents({
    dataDir: getDataDir('f1aire'),
    sessionKey: transcriptSessionKey,
  });

  engineerRef.current = createEngineerSession({
    model,
    tools,
    system,
    initialTranscript,
  });

  setAppState((state) => ({
    ...state,
    engineer: {
      ...state.engineer,
      transcriptEvents: initialTranscript,
    },
  }));

}, [model, setAppState, system, tools]);
```

Modify `src/tui/screens/Summary.tsx` or `Settings.tsx` to expose a clear "resume prior engineer transcript" affordance when stored transcript events exist for the selected session. Keep copy concise and non-modal:

```tsx
<Text dimColor>
  Prior engineer transcript found. Press Enter to continue, or Backspace to
  choose another session.
</Text>
```

- [ ] **Step 4: Run persistence and app tests**

Run: `npm test -- src/agent/session-transcript-store.test.ts src/app.test.ts`

Expected: both suites pass.

- [ ] **Step 5: Commit transcript persistence**

```bash
git add src/agent/session-transcript-store.ts src/agent/session-transcript-store.test.ts src/agent/engineer.ts src/tui/app/use-engineer-session.ts src/tui/screens/Settings.tsx src/tui/screens/Summary.tsx src/app.test.ts
git commit -m "feat: persist engineer transcripts for session resume"
```

---

### Task 9: Add Performance and UX Guardrails So Regressions Stay Caught

**Files:**
- Create: `src/tui/perf-render-budget.test.tsx`
- Modify: `src/tui/perf.ts`
- Modify: `src/tui/screens/EngineerChat.test.tsx`
- Modify: `src/app-engineer-shell.test.tsx`
- Modify: `docs/architecture.md` or `docs/f1aire-tui-architecture.md`

- [ ] **Step 1: Write a failing render-budget regression test**

Create `src/tui/perf-render-budget.test.tsx`:

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import type { Meeting, Session } from '../core/types.js';
import { EngineerChat } from './screens/EngineerChat.js';

describe('EngineerChat render budget', () => {
  it('does not call onConversationRender once per historical message when one stream chunk arrives', () => {
    const onConversationRender = vi.fn();
    const meeting = { Name: 'Monaco Grand Prix', MeetingKey: 1 } as Meeting;
    const session = { Name: 'Race', SessionKey: 1 } as Session;
    const messages = Array.from({ length: 300 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `historical message ${index}`,
    }));

    const { rerender } = render(
      <EngineerChat
        messages={messages}
        onSend={() => {}}
        streamingText=""
        isStreaming={false}
        status={null}
        year={2025}
        meeting={meeting}
        session={session}
        summary={null}
        activity={[]}
        asOfLabel="Latest data"
        onConversationRender={onConversationRender}
      />,
    );

    onConversationRender.mockClear();

    rerender(
      <EngineerChat
        messages={messages}
        onSend={() => {}}
        streamingText="new delta"
        isStreaming={true}
        status="Thinking..."
        year={2025}
        meeting={meeting}
        session={session}
        summary={null}
        activity={['Thinking...']}
        asOfLabel="Latest data"
        onConversationRender={onConversationRender}
      />,
    );

    expect(onConversationRender.mock.calls.length).toBeLessThan(20);
  });
});
```

- [ ] **Step 2: Run the render-budget test and verify it fails before memoization/virtualization is fully wired**

Run: `npm test -- src/tui/perf-render-budget.test.tsx`

Expected: `FAIL src/tui/perf-render-budget.test.tsx` if historical transcript rendering still scales with total message count on each stream update, or if imports need updating after Task 4.

- [ ] **Step 3: Tighten memoization, stabilize row IDs, and document architecture boundaries**

Modify `src/tui/screens/EngineerChat.tsx` so `ComposerPanel`, transcript row rendering, and details/status rendering only receive the props they need, and historical row components are wrapped in `React.memo` with stable IDs from `transcript-model.ts`.

Modify `src/tui/perf.ts` to expose one helper for sampled render-duration logging that tests can stub:

```ts
export function createRenderBudgetLogger({
  warnMs,
  now = () => performance.now(),
  write = () => {},
}: {
  warnMs: number;
  now?: () => number;
  write?: (event: { type: 'render-budget'; durationMs: number }) => void;
}) {
  return async function measureRender<T>(work: () => T): Promise<T> {
    const start = now();
    const value = work();
    const durationMs = now() - start;
    if (durationMs >= warnMs) {
      write({ type: 'render-budget', durationMs });
    }
    return value;
  };
}
```

Add `docs/f1aire-tui-architecture.md` with a short boundary note covering:

- `src/tui/state/*` owns route/runtime/UI state subscriptions
- `src/agent/transcript-events.ts` + `src/tui/screens/engineer/transcript-model.ts` own transcript data contracts
- `src/tui/keybindings/*` owns user action routing
- `src/tui/theme/*` owns semantic visual tokens
- screen components should consume selectors and typed models, not reconstruct global state manually

- [ ] **Step 4: Run the final regression suite**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: typecheck passes, all Vitest suites pass, and build emits `dist/` successfully.

- [ ] **Step 5: Commit guardrails and architecture docs**

```bash
git add src/tui/perf-render-budget.test.tsx src/tui/perf.ts src/tui/screens/EngineerChat.test.tsx src/app-engineer-shell.test.tsx docs/f1aire-tui-architecture.md
git commit -m "test: add tui render and architecture guardrails"
```

---

## Self-Review

### Spec Coverage

- Borrow selector-based state architecture from Claude Code: covered by Tasks 1-2.
- Borrow structured transcript rendering and long-session scalability patterns: covered by Tasks 3-4 and Task 9.
- Borrow explicit keybinding/scroll routing concepts: covered by Task 5.
- Borrow semantic theme/provider discipline and calmer app-wide chrome: covered by Tasks 6-7.
- Borrow resume/persistence affordances without copying broad plugin scope: covered by Task 8.
- Add performance and UX regression protection: covered by Task 9.

### Placeholder Scan

The plan intentionally avoids `TBD`, `TODO`, and "similar to Task N" references. Every task names exact files, includes implementation snippets, gives runnable commands, and specifies expected outcomes.

### Type Consistency

Shared names are consistent across tasks:

- `AppState`, `createInitialAppState`, `AppStateProvider`, `useAppState`, `useSetAppState`
- `TranscriptEvent`, `buildTranscriptModel`, `TranscriptRow`
- `KeybindingContext`, `KeyActionId`, `Keybinding`, `useKeybindings`
- `F1aireTheme`, `darkTheme`, `ThemeProvider`, `useTheme`
- `saveTranscriptEvents`, `loadTranscriptEvents`
