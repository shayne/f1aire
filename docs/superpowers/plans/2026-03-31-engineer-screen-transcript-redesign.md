# Engineer Screen Transcript Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the engineer screen around a transcript-first viewport and a sticky multiline composer without changing app-wide routing or the existing markdown renderer.

**Architecture:** Keep [`src/tui/screens/EngineerChat.tsx`](/Users/shayne/code/f1aire/src/tui/screens/EngineerChat.tsx) as the public screen entrypoint, but move transcript, composer, and details behavior into focused modules under `src/tui/screens/engineer/`. Preserve `App` as the owner of transport/session state, and keep engineer-local UI state inside `useTranscriptViewport` and `useComposerState`.

**Tech Stack:** TypeScript, React 18, Ink 5, Vitest, `ink-testing-library`, `marked`, `marked-terminal`

---

## Planned File Structure

**Create**

- `src/tui/screens/engineer/transcript-rows.ts` — build normalized transcript rows from `ChatMessage[]`, `streamingText`, and `status`
- `src/tui/screens/engineer/transcript-rows.test.ts` — transcript row derivation coverage
- `src/tui/screens/engineer/useTranscriptViewport.ts` — follow/pause/resize state and pure viewport helpers
- `src/tui/screens/engineer/useTranscriptViewport.test.ts` — viewport state coverage
- `src/tui/screens/engineer/useComposerState.ts` — local draft, cursor, wrapping, submit/newline rules
- `src/tui/screens/engineer/useComposerState.test.ts` — composer state coverage
- `src/tui/screens/engineer/Composer.tsx` — sticky bottom composer UI
- `src/tui/screens/engineer/Composer.test.tsx` — composer rendering and submit behavior
- `src/tui/screens/engineer/TranscriptViewport.tsx` — transcript surface UI
- `src/tui/screens/engineer/TranscriptViewport.test.tsx` — transcript viewport rendering coverage
- `src/tui/screens/engineer/EngineerDetails.tsx` — compact details strip and expandable details panel
- `src/tui/screens/engineer/EngineerDetails.test.tsx` — details strip/panel coverage

**Modify**

- `src/tui/screens/EngineerChat.tsx` — reduce to engineer workspace composition and keep export stable
- `src/tui/screens/EngineerChat.test.tsx` — update integration coverage for the redesigned screen
- `src/app.tsx` — keep routing stable, only adjust props or hints needed by the redesign
- `src/tui/components/FooterHints.tsx` — document newline and details controls
- `src/tui/components/FooterHints.test.tsx` — cover new footer hints
- `src/tui/layout.ts` — keep `getSessionItems`, remove right-pane-specific helpers if they become dead code
- `src/tui/layout.test.ts` — remove or replace right-pane-only tests

---

### Task 1: Extract Transcript Rows And Viewport State

**Files:**

- Create: `src/tui/screens/engineer/transcript-rows.ts`
- Test: `src/tui/screens/engineer/transcript-rows.test.ts`
- Create: `src/tui/screens/engineer/useTranscriptViewport.ts`
- Test: `src/tui/screens/engineer/useTranscriptViewport.test.ts`
- Modify: `src/tui/screens/EngineerChat.tsx`

- [ ] **Step 1: Write the failing transcript-row tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildTranscriptRows } from './transcript-rows.js';

describe('buildTranscriptRows', () => {
  it('renders user and assistant messages into labeled transcript rows', () => {
    const rows = buildTranscriptRows({
      messages: [
        { role: 'user', content: 'How is pace?' },
        { role: 'assistant', content: 'Very strong over the last 5 laps.' },
      ],
      streamingText: '',
      isStreaming: false,
      status: null,
      messageWidth: 24,
    });

    expect(rows.map((row) => row.plainText)).toContain('You');
    expect(rows.map((row) => row.plainText)).toContain('Engineer');
    expect(rows.some((row) => row.plainText.includes('Very strong'))).toBe(true);
  });

  it('adds a pending status block when streaming text is empty', () => {
    const rows = buildTranscriptRows({
      messages: [],
      streamingText: '',
      isStreaming: true,
      status: 'Thinking',
      messageWidth: 24,
    });

    expect(rows.some((row) => row.kind === 'pending-status')).toBe(true);
    expect(rows.some((row) => row.plainText.includes('Thinking'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the transcript-row test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/transcript-rows.test.ts`

Expected: FAIL with `Cannot find module './transcript-rows.js'` or `buildTranscriptRows is not exported`

- [ ] **Step 3: Implement `buildTranscriptRows()` with stable row metadata**

```ts
import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage } from '../../chat-state.js';
import { theme } from '../../theme.js';
import { renderMarkdownToTerminal } from '../../terminal-markdown.js';

export type TranscriptRow = {
  key: string;
  kind: 'label' | 'message-line' | 'spacer' | 'pending-status';
  plainText: string;
  node: React.ReactNode;
};

export function buildTranscriptRows({
  messages,
  streamingText,
  isStreaming,
  status,
  messageWidth,
}: {
  messages: ChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  status: string | null;
  messageWidth: number;
}): TranscriptRow[] {
  const rows: TranscriptRow[] = [];

  const pushMessage = (message: ChatMessage, keyPrefix: string) => {
    const label = message.role === 'assistant' ? 'Engineer' : 'You';
    const color = message.role === 'assistant' ? theme.assistant : theme.user;
    const rawText =
      message.role === 'assistant'
        ? renderMarkdownToTerminal(message.content, messageWidth)
        : message.content;

    rows.push({
      key: `${keyPrefix}-label`,
      kind: 'label',
      plainText: label,
      node: <Text color={color}>{label}</Text>,
    });

    for (const [lineIndex, line] of rawText.split('\n').entries()) {
      rows.push({
        key: `${keyPrefix}-line-${lineIndex}`,
        kind: 'message-line',
        plainText: line,
        node: <Text wrap="truncate-end">{`  ${line}`}</Text>,
      });
    }

    rows.push({
      key: `${keyPrefix}-spacer`,
      kind: 'spacer',
      plainText: '',
      node: <Text> </Text>,
    });
  };

  messages.forEach((message, index) => pushMessage(message, `m-${index}`));

  if (isStreaming && streamingText) {
    pushMessage({ role: 'assistant', content: streamingText }, 'stream');
  } else if (isStreaming && status) {
    rows.push({
      key: 'pending-label',
      kind: 'label',
      plainText: 'Engineer',
      node: <Text color={theme.assistant}>Engineer</Text>,
    });
    rows.push({
      key: 'pending-status',
      kind: 'pending-status',
      plainText: status,
      node: (
        <Box>
          <Text color={theme.muted}>{status}</Text>
        </Box>
      ),
    });
  }

  return rows;
}
```

- [ ] **Step 4: Run the transcript-row test to verify it passes**

Run: `npm test -- src/tui/screens/engineer/transcript-rows.test.ts`

Expected: PASS

- [ ] **Step 5: Write the failing viewport-state tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  getTranscriptWindow,
  reconcilePausedOffset,
  getTranscriptScrollHint,
} from './useTranscriptViewport.js';

describe('reconcilePausedOffset', () => {
  it('preserves the same transcript slice when new rows arrive while paused', () => {
    expect(
      reconcilePausedOffset({
        previousRowCount: 18,
        nextRowCount: 21,
        currentScrollOffsetLines: 6,
        visibleLineCount: 8,
      }),
    ).toBe(9);
  });
});

describe('getTranscriptWindow', () => {
  it('returns the live tail when the viewport is following output', () => {
    expect(
      getTranscriptWindow({
        rowCount: 20,
        visibleLineCount: 6,
        scrollOffsetLines: 0,
      }),
    ).toEqual({ start: 14, end: 20 });
  });
});

describe('getTranscriptScrollHint', () => {
  it('returns catch-up copy when newer output is below the paused viewport', () => {
    expect(
      getTranscriptScrollHint({
        isScrolledUp: true,
        hasUpdatesBelow: true,
      }),
    ).toBe('New updates below · pgdn to catch up');
  });
});
```

- [ ] **Step 6: Run the viewport-state test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/useTranscriptViewport.test.ts`

Expected: FAIL with `Cannot find module './useTranscriptViewport.js'`

- [ ] **Step 7: Implement pure viewport helpers and the hook shell**

```ts
import { useLayoutEffect, useRef, useState } from 'react';

export function reconcilePausedOffset(args: {
  previousRowCount: number;
  nextRowCount: number;
  currentScrollOffsetLines: number;
  visibleLineCount: number;
}): number {
  const nextMaxScrollLines = Math.max(args.nextRowCount - args.visibleLineCount, 0);

  if (
    args.previousRowCount > 0 &&
    args.nextRowCount > args.previousRowCount &&
    args.currentScrollOffsetLines > 0
  ) {
    return Math.min(
      args.currentScrollOffsetLines + (args.nextRowCount - args.previousRowCount),
      nextMaxScrollLines,
    );
  }

  return Math.min(args.currentScrollOffsetLines, nextMaxScrollLines);
}

export function getTranscriptWindow(args: {
  rowCount: number;
  visibleLineCount: number;
  scrollOffsetLines: number;
}) {
  const start = Math.max(
    args.rowCount - args.visibleLineCount - args.scrollOffsetLines,
    0,
  );
  return { start, end: start + args.visibleLineCount };
}

export function getTranscriptScrollHint(args: {
  isScrolledUp: boolean;
  hasUpdatesBelow: boolean;
}) {
  if (!args.isScrolledUp) return null;
  return args.hasUpdatesBelow
    ? 'New updates below · pgdn to catch up'
    : 'Viewing earlier output · pgdn to return live';
}

export function useTranscriptViewport(args: {
  rowCount: number;
  visibleLineCount: number;
  transcriptVersion: number;
}) {
  const [scrollOffsetLines, setScrollOffsetLines] = useState(0);
  const pausedTranscriptVersionRef = useRef<number | null>(null);
  const previousRowCountRef = useRef(0);
  const maxScrollLines = Math.max(args.rowCount - args.visibleLineCount, 0);

  useLayoutEffect(() => {
    setScrollOffsetLines((current) =>
      reconcilePausedOffset({
        previousRowCount: previousRowCountRef.current,
        nextRowCount: args.rowCount,
        currentScrollOffsetLines: current,
        visibleLineCount: args.visibleLineCount,
      }),
    );
    previousRowCountRef.current = args.rowCount;
  }, [args.rowCount, args.visibleLineCount]);

  const hasUpdatesBelow =
    scrollOffsetLines > 0 &&
    pausedTranscriptVersionRef.current !== null &&
    args.transcriptVersion > pausedTranscriptVersionRef.current;

  const window = getTranscriptWindow({
    rowCount: args.rowCount,
    visibleLineCount: args.visibleLineCount,
    scrollOffsetLines,
  });

  return {
    scrollOffsetLines,
    setScrollOffsetLines,
    maxScrollLines,
    window,
    scrollHint: getTranscriptScrollHint({
      isScrolledUp: scrollOffsetLines > 0,
      hasUpdatesBelow,
    }),
    markPaused() {
      if (scrollOffsetLines === 0) {
        pausedTranscriptVersionRef.current = args.transcriptVersion;
      }
    },
    jumpToLatest() {
      pausedTranscriptVersionRef.current = null;
      setScrollOffsetLines(0);
    },
  };
}
```

- [ ] **Step 8: Run the focused viewport tests**

Run: `npm test -- src/tui/screens/engineer/useTranscriptViewport.test.ts src/tui/screens/engineer/transcript-rows.test.ts`

Expected: PASS

- [ ] **Step 9: Wire `EngineerChat.tsx` to use the new helpers without changing the current layout yet**

```ts
import { buildTranscriptRows } from './engineer/transcript-rows.js';
import { useTranscriptViewport } from './engineer/useTranscriptViewport.js';

const transcriptRows = useMemo(
  () =>
    buildTranscriptRows({
      messages,
      streamingText,
      isStreaming,
      status,
      messageWidth: messageContentWidth,
    }),
  [messages, streamingText, isStreaming, status, messageContentWidth],
);

const viewport = useTranscriptViewport({
  rowCount: transcriptRows.length,
  visibleLineCount: availableMessageLines,
  transcriptVersion: messages.length + (isStreaming ? 1 : 0),
});

const visibleRows = transcriptRows.slice(viewport.window.start, viewport.window.end);
```

- [ ] **Step 10: Run the existing engineer-screen tests**

Run: `npm test -- src/tui/screens/EngineerChat.test.tsx`

Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add \
  src/tui/screens/engineer/transcript-rows.ts \
  src/tui/screens/engineer/transcript-rows.test.ts \
  src/tui/screens/engineer/useTranscriptViewport.ts \
  src/tui/screens/engineer/useTranscriptViewport.test.ts \
  src/tui/screens/EngineerChat.tsx
git commit -m "refactor: extract engineer transcript state"
```

### Task 2: Build The Sticky Multiline Composer

**Files:**

- Create: `src/tui/screens/engineer/useComposerState.ts`
- Test: `src/tui/screens/engineer/useComposerState.test.ts`
- Create: `src/tui/screens/engineer/Composer.tsx`
- Test: `src/tui/screens/engineer/Composer.test.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`

- [ ] **Step 1: Write the failing composer-state tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyComposerEnter,
  getComposerVisibleLines,
} from './useComposerState.js';

describe('getComposerVisibleLines', () => {
  it('caps visible lines at 5', () => {
    expect(
      getComposerVisibleLines({
        text: 'one\\ntwo\\nthree\\nfour\\nfive\\nsix',
        width: 30,
        maxVisibleLines: 5,
      }),
    ).toBe(5);
  });
});

describe('applyComposerEnter', () => {
  it('submits on plain enter', () => {
    expect(
      applyComposerEnter({
        text: 'How is tyre life?',
        shift: false,
      }),
    ).toEqual({ action: 'submit', nextText: 'How is tyre life?' });
  });

  it('inserts a newline on shift+enter', () => {
    expect(
      applyComposerEnter({
        text: 'line one',
        shift: true,
      }),
    ).toEqual({ action: 'insert-newline', nextText: 'line one\\n' });
  });
});
```

- [ ] **Step 2: Run the composer-state test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/useComposerState.test.ts`

Expected: FAIL with `Cannot find module './useComposerState.js'`

- [ ] **Step 3: Implement the pure composer helpers and hook state**

```ts
import { useMemo, useState } from 'react';

export function getComposerVisibleLines(args: {
  text: string;
  width: number;
  maxVisibleLines: number;
}): number {
  const safeWidth = Math.max(args.width, 1);
  const wrappedLineCount = args.text.split('\n').reduce((count, line) => {
    return count + Math.max(Math.ceil(Math.max(line.length, 1) / safeWidth), 1);
  }, 0);
  return Math.min(Math.max(wrappedLineCount, 1), args.maxVisibleLines);
}

export function applyComposerEnter(args: { text: string; shift: boolean }) {
  if (args.shift) {
    return { action: 'insert-newline' as const, nextText: `${args.text}\n` };
  }
  return { action: 'submit' as const, nextText: args.text };
}

export function useComposerState(args: {
  width: number;
  isStreaming: boolean;
  maxVisibleLines?: number;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const insertText = (text: string) => {
    setDraft((current) => {
      const next = `${current.slice(0, cursorOffset)}${text}${current.slice(cursorOffset)}`;
      setCursorOffset(cursorOffset + text.length);
      return next;
    });
  };
  const backspace = () => {
    if (cursorOffset === 0) return;
    setDraft((current) => current.slice(0, cursorOffset - 1) + current.slice(cursorOffset));
    setCursorOffset(cursorOffset - 1);
  };
  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed || args.isStreaming) return;
    args.onSend(trimmed);
    setDraft('');
    setCursorOffset(0);
  };
  const visibleLines = useMemo(
    () =>
      getComposerVisibleLines({
        text: draft,
        width: args.width,
        maxVisibleLines: args.maxVisibleLines ?? 5,
      }),
    [draft, args.width, args.maxVisibleLines],
  );

  return {
    draft,
    setDraft,
    cursorOffset,
    setCursorOffset,
    visibleLines,
    insertText,
    backspace,
    submit,
  };
}
```

- [ ] **Step 4: Run the composer-state test to verify it passes**

Run: `npm test -- src/tui/screens/engineer/useComposerState.test.ts`

Expected: PASS

- [ ] **Step 5: Write the failing composer component tests**

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer.js';

describe('Composer', () => {
  it('submits on enter and clears the local draft', async () => {
    const onSend = vi.fn();
    const { stdin, lastFrame } = render(
      <Composer width={40} isStreaming={false} onSend={onSend} />,
    );

    stdin.write('pace');
    stdin.write('\r');

    expect(onSend).toHaveBeenCalledWith('pace');
    expect(lastFrame()).not.toContain('pace');
  });

  it('renders the newline hint in the footer copy', () => {
    const { lastFrame } = render(
      <Composer width={40} isStreaming={false} onSend={() => {}} />,
    );

    expect(lastFrame()).toContain('shift+enter newline');
  });
});
```

- [ ] **Step 6: Run the composer component test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/Composer.test.tsx`

Expected: FAIL with `Cannot find module './Composer.js'`

- [ ] **Step 7: Implement the sticky composer UI with local input handling**

```tsx
import React from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../../theme.js';
import { applyComposerEnter, useComposerState } from './useComposerState.js';

export function Composer({
  width,
  isStreaming,
  onSend,
}: {
  width: number;
  isStreaming: boolean;
  onSend: (text: string) => void;
}) {
  const composer = useComposerState({ width, isStreaming, onSend, maxVisibleLines: 5 });

  useInput((input, key) => {
    if (key.return) {
      const enterAction = applyComposerEnter({
        text: composer.draft,
        shift: key.shift,
      });

      if (enterAction.action === 'insert-newline') {
        composer.insertText('\n');
        return;
      }

      composer.submit();
      return;
    }

    if (key.backspace || key.delete) {
      composer.backspace();
      return;
    }

    if (!key.ctrl && !key.meta && input) {
      composer.insertText(input);
    }
  });

  return (
    <Box flexDirection="column" borderTop borderColor={theme.border} paddingTop={1}>
      <Text color={theme.muted}>Ask the engineer</Text>
      <Text>{composer.draft || 'Ask about pace, gaps, tyres...'}</Text>
      <Text color={theme.muted}>
        enter send · shift+enter newline · pgup/pgdn scroll/live
      </Text>
    </Box>
  );
}
```

- [ ] **Step 8: Swap `AskInput` out of `EngineerChat.tsx` for `Composer`**

```tsx
import { Composer } from './engineer/Composer.js';

<Composer
  width={leftPaneWidth}
  isStreaming={isStreaming}
  onSend={onSend}
/>
```

- [ ] **Step 9: Run the focused composer and engineer-screen tests**

Run: `npm test -- src/tui/screens/engineer/useComposerState.test.ts src/tui/screens/engineer/Composer.test.tsx src/tui/screens/EngineerChat.test.tsx`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add \
  src/tui/screens/engineer/useComposerState.ts \
  src/tui/screens/engineer/useComposerState.test.ts \
  src/tui/screens/engineer/Composer.tsx \
  src/tui/screens/engineer/Composer.test.tsx \
  src/tui/screens/EngineerChat.tsx
git commit -m "ux: add multiline engineer composer"
```

### Task 3: Replace The Dashboard Layout With A Transcript-First Workspace

**Files:**

- Create: `src/tui/screens/engineer/TranscriptViewport.tsx`
- Test: `src/tui/screens/engineer/TranscriptViewport.test.tsx`
- Create: `src/tui/screens/engineer/EngineerDetails.tsx`
- Test: `src/tui/screens/engineer/EngineerDetails.test.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/layout.ts`
- Modify: `src/tui/layout.test.ts`

- [ ] **Step 1: Write the failing transcript viewport component test**

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { TranscriptViewport } from './TranscriptViewport.js';

describe('TranscriptViewport', () => {
  it('renders the newest rows when following live output', () => {
    const { lastFrame } = render(
      <TranscriptViewport
        visibleRows={[
          { key: '1', kind: 'message-line', plainText: 'older', node: 'older' },
          { key: '2', kind: 'message-line', plainText: 'newer', node: 'newer' },
        ]}
        scrollHint={null}
      />,
    );

    expect(lastFrame()).toContain('newer');
    expect(lastFrame()).not.toContain('older');
  });
});
```

- [ ] **Step 2: Run the transcript viewport component test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/TranscriptViewport.test.tsx`

Expected: FAIL with `Cannot find module './TranscriptViewport.js'`

- [ ] **Step 3: Implement `TranscriptViewport` as the primary transcript surface**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { TranscriptRow } from './transcript-rows.js';

export function TranscriptViewport({
  visibleRows,
  scrollHint,
}: {
  visibleRows: TranscriptRow[];
  scrollHint: string | null;
}) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {scrollHint ? <Text dimColor>{scrollHint}</Text> : null}
      {visibleRows.map((row) => (
        <Box key={row.key}>{row.node}</Box>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Write the failing engineer-details test**

```tsx
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { EngineerDetails } from './EngineerDetails.js';

describe('EngineerDetails', () => {
  it('renders a compact status strip and hides the expanded panel by default', () => {
    const { lastFrame } = render(
      <EngineerDetails
        year={2025}
        meetingName="Test GP"
        sessionName="Race"
        sessionType="Race"
        summary={null}
        asOfLabel="Latest"
        activity={['Thinking']}
        pythonCode=""
        isExpanded={false}
      />,
    );

    expect(lastFrame()).toContain('Test GP');
    expect(lastFrame()).toContain('Thinking');
    expect(lastFrame()).not.toContain('Python');
  });
});
```

- [ ] **Step 5: Run the engineer-details test to verify it fails**

Run: `npm test -- src/tui/screens/engineer/EngineerDetails.test.tsx`

Expected: FAIL with `Cannot find module './EngineerDetails.js'`

- [ ] **Step 6: Implement a compact strip plus toggled expanded details panel**

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { getSessionItems } from '../../layout.js';
import { Panel } from '../../components/Panel.js';

export function EngineerDetails({
  year,
  meetingName,
  sessionName,
  sessionType,
  summary,
  asOfLabel,
  activity,
  pythonCode,
  isExpanded,
}: {
  year: number;
  meetingName: string;
  sessionName: string;
  sessionType: string;
  summary: { winner?: { name: string; number: string } | null; fastestLap?: { name: string; number: string; time: string } | null; totalLaps?: number | null } | null;
  asOfLabel: string | null;
  activity: string[];
  pythonCode: string;
  isExpanded: boolean;
}) {
  const sessionItems = getSessionItems({
    mode: 'compact',
    year,
    meetingName,
    sessionName,
    sessionType,
    summary,
    asOfLabel,
  });
  const latestActivity = activity.at(-1) ?? 'Idle';
  const pythonPreview = pythonCode.split('\n').slice(-3);

  return (
    <Box flexDirection="column">
      <Text dimColor>
        {sessionItems.map((item) => `${item.label}: ${item.value}`).join(' · ')}
        {` · Status: ${latestActivity}`}
      </Text>
      {isExpanded ? (
        <Panel title="Details" tone="muted">
          <Box flexDirection="column">
            <Text>{latestActivity}</Text>
            {pythonPreview.map((line, index) => (
              <Text key={`${index}-${line}`} dimColor>
                {line}
              </Text>
            ))}
          </Box>
        </Panel>
      ) : null}
    </Box>
  );
}
```

- [ ] **Step 7: Rebuild `EngineerChat.tsx` as a transcript-first workspace**

```tsx
import { Composer } from './engineer/Composer.js';
import { EngineerDetails } from './engineer/EngineerDetails.js';
import { TranscriptViewport } from './engineer/TranscriptViewport.js';

export function EngineerChat(props: EngineerChatProps) {
  const visibleRows = transcriptRows.slice(viewport.window.start, viewport.window.end);

  return (
    <Box flexDirection="column" height={rows}>
      <TranscriptViewport
        visibleRows={visibleRows}
        scrollHint={viewport.scrollHint}
      />
      <EngineerDetails
        year={year}
        meetingName={meeting.Name}
        sessionName={session.Name}
        sessionType={session.Type}
        summary={summary}
        asOfLabel={asOfLabel ?? null}
        activity={activityEntries}
        pythonCode={pythonCode ?? ''}
        isExpanded={detailsExpanded}
      />
      <Composer
        width={columns}
        isStreaming={isStreaming}
        onSend={onSend}
      />
    </Box>
  );
}
```

- [ ] **Step 8: Remove right-pane-only layout helpers once the new details surface is wired**

```ts
export type SessionSummary = {
  winner?: { name: string; number: string } | null;
  fastestLap?: { name: string; number: string; time: string } | null;
  totalLaps?: number | null;
};

export type StatItem = { label: string; value: string };

export function getSessionItems(args: {
  mode: 'minimal' | 'compact' | 'full';
  year: number;
  meetingName: string;
  sessionName: string;
  sessionType: string;
  summary: SessionSummary | null;
  asOfLabel?: string | null;
}): StatItem[] {
  const items: StatItem[] = [
    { label: 'Year', value: String(args.year) },
    { label: 'Event', value: args.meetingName },
    { label: 'Session', value: `${args.sessionName} (${args.sessionType})` },
  ];

  if (args.asOfLabel) items.push({ label: 'As of', value: args.asOfLabel });
  if (args.mode === 'minimal' || !args.summary) return items;

  items.push({
    label: 'Winner',
    value: args.summary.winner
      ? `${args.summary.winner.name} (#${args.summary.winner.number})`
      : 'n/a',
  });

  items.push({
    label: 'Fastest lap',
    value: args.summary.fastestLap
      ? `${args.summary.fastestLap.name} (#${args.summary.fastestLap.number}) ${args.summary.fastestLap.time}`
      : 'n/a',
  });

  return args.mode === 'full' && args.summary.totalLaps != null
    ? [...items, { label: 'Total laps', value: String(args.summary.totalLaps) }]
    : items;
}
```

- [ ] **Step 9: Run the focused workspace tests**

Run: `npm test -- src/tui/screens/engineer/TranscriptViewport.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/EngineerChat.test.tsx src/tui/layout.test.ts`

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add \
  src/tui/screens/engineer/TranscriptViewport.tsx \
  src/tui/screens/engineer/TranscriptViewport.test.tsx \
  src/tui/screens/engineer/EngineerDetails.tsx \
  src/tui/screens/engineer/EngineerDetails.test.tsx \
  src/tui/screens/EngineerChat.tsx \
  src/tui/layout.ts \
  src/tui/layout.test.ts
git commit -m "ux: redesign engineer workspace layout"
```

### Task 4: Update App Wiring, Hints, And Regression Coverage

**Files:**

- Modify: `src/app.tsx`
- Modify: `src/tui/components/FooterHints.tsx`
- Modify: `src/tui/components/FooterHints.test.tsx`
- Modify: `src/tui/screens/EngineerChat.test.tsx`

- [ ] **Step 1: Write the failing footer-hints regression test**

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FooterHints } from './FooterHints.js';

describe('FooterHints', () => {
  it('documents newline and details controls on the engineer screen', () => {
    const { lastFrame } = render(<FooterHints screen="engineer" />);

    expect(lastFrame()).toContain('shift+enter newline');
    expect(lastFrame()).toContain('i details');
  });
});
```

- [ ] **Step 2: Run the footer-hints test to verify it fails**

Run: `npm test -- src/tui/components/FooterHints.test.tsx`

Expected: FAIL because the current hint string does not include the new controls

- [ ] **Step 3: Update footer hints and the engineer integration tests**

```tsx
// src/tui/components/FooterHints.tsx
if (screen === 'engineer') {
  return (
    <Text color={theme.muted}>
      enter send · shift+enter newline · pgup/pgdn scroll/live · i details · esc back · ctrl+c quit
    </Text>
  );
}
```

```tsx
// src/tui/screens/EngineerChat.test.tsx
it('does not re-render the transcript viewport when typing', async () => {
  const onConversationRender = vi.fn();
  const { stdin } = render(
    <EngineerChat {...baseProps} onConversationRender={onConversationRender} />,
  );

  await tick();
  expect(onConversationRender).toHaveBeenCalledTimes(1);

  stdin.write('a');
  await tick();

  expect(onConversationRender).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 4: Keep `App` routing stable and avoid new engineer-specific state there**

```tsx
{screen.name === 'engineer' && (
  <EngineerChat
    messages={messages}
    streamingText={streamingText}
    onSend={handleSend}
    isStreaming={isStreaming}
    status={streamStatus}
    year={screen.year}
    meeting={screen.meeting}
    session={screen.session}
    summary={summary}
    activity={activity}
    pythonCode={pythonCodePreview}
    maxHeight={contentHeight}
    asOfLabel={asOfLabel}
  />
)}
```

- [ ] **Step 5: Run the focused regressions, then the full suite used for this feature**

Run: `npm test -- src/tui/components/FooterHints.test.tsx src/tui/screens/EngineerChat.test.tsx`

Expected: PASS

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add \
  src/app.tsx \
  src/tui/components/FooterHints.tsx \
  src/tui/components/FooterHints.test.tsx \
  src/tui/screens/EngineerChat.test.tsx
git commit -m "test: cover engineer screen transcript workflow"
```

---

## Self-Review Checklist

- Spec coverage: transcript-first layout, sticky multiline composer, paused/live transcript behavior, compact details surface, footer hint updates, and engineer-only scope all have explicit tasks.
- Placeholder scan: no `TODO`, `TBD`, or “implement later” markers remain in task steps.
- Type consistency: `buildTranscriptRows`, `useTranscriptViewport`, `useComposerState`, `TranscriptViewport`, `Composer`, and `EngineerDetails` keep the same names across tasks.
