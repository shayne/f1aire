# Engineer Shell Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `engineer` screen onto a copied fullscreen shell runtime with transcript-first scrolling and a pinned multiline composer, while keeping `f1aire`’s app state ownership intact.

**Architecture:** Copy the upstream custom Ink runtime into `src/vendor/`, restore the original source from inline sourcemaps, and expose it through a local `#ink` facade plus a custom test harness. Because host renderers cannot be mixed in one React tree, the copied renderer becomes the app-wide host renderer, but only the `engineer` route adopts the fullscreen shell structure in this pass; the rest of the screens keep their current layouts with local replacements for stock Ink widgets.

**Tech Stack:** TypeScript, React 18, copied custom Ink runtime, `yoga-layout`, Vitest, local renderer test harness

---

## File Map

### Vendor runtime and support tree

- Create: `scripts/vendor/restore-vendor-source.mjs`
- Create: `src/vendor/ink/**` copied from `/Users/shayne/code/claude-code/ink/**`
- Create: `src/vendor/components/FullscreenLayout.tsx` copied from `/Users/shayne/code/claude-code/components/FullscreenLayout.tsx`, then reduced to the props `f1aire` actually needs
- Create: `src/vendor/bootstrap/state.ts`
- Create: `src/vendor/native-ts/yoga-layout/index.ts`
- Create: `src/vendor/utils/debug.ts`
- Create: `src/vendor/utils/log.ts`
- Create: `src/vendor/utils/env.ts`
- Create: `src/vendor/utils/envUtils.ts`
- Create: `src/vendor/utils/fullscreen.ts`
- Create: `src/vendor/utils/intl.ts`
- Create: `src/vendor/utils/sliceAnsi.ts`
- Create: `src/vendor/utils/execFileNoThrow.ts`
- Create: `src/vendor/utils/earlyInput.ts`
- Create: `src/vendor/utils/semver.ts`

### Local renderer facade and test harness

- Create: `src/ink/index.ts`
- Create: `src/ink/use-terminal-size.ts`
- Create: `src/ink/testing.tsx`
- Test: `src/ink/testing.test.tsx`

### Local compatibility widgets for non-engineer screens

- Create: `src/tui/components/MenuList.tsx`
- Create: `src/tui/components/MenuList.test.tsx`
- Create: `src/tui/components/SecretTextInput.tsx`
- Create: `src/tui/components/SecretTextInput.test.tsx`
- Modify: `src/tui/components/SelectList.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.tsx`
- Modify: `src/tui/screens/SeasonPicker.tsx`
- Modify: `src/tui/screens/MeetingPicker.tsx`
- Modify: `src/tui/screens/SessionPicker.tsx`
- Modify: `src/tui/screens/Settings.tsx`

### Engineer shell migration

- Create: `src/tui/screens/engineer/EngineerShell.tsx`
- Create: `src/tui/screens/engineer/EngineerShell.test.tsx`
- Create: `src/tui/screens/engineer/EngineerSessionStrip.tsx`
- Create: `src/tui/screens/engineer/useEngineerScrollState.ts`
- Create: `src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/engineer/Composer.tsx`
- Modify: `src/tui/screens/engineer/useComposerState.ts`
- Modify: `src/tui/screens/engineer/EngineerDetails.tsx`
- Delete or stop using: `src/tui/screens/engineer/TranscriptViewport.tsx`
- Delete or stop using: `src/tui/screens/engineer/useTranscriptViewport.ts`

### App integration and regression coverage

- Modify: `src/index.tsx`
- Modify: `src/app.tsx`
- Create: `src/app-engineer-shell.test.tsx`
- Modify: all `src/**/*.test.tsx` files that currently import `render` from `ink-testing-library`
- Modify: `package.json`
- Modify: `package-lock.json`

## Implementation note discovered during planning

The copied runtime cannot be mounted only for the `engineer` subtree while the rest of the app still renders through stock Ink. React host renderers own the entire tree. The correct boundary is:

- renderer swap at the app root
- fullscreen shell swap on the `engineer` route only
- local widget replacements for `ink-select-input` and `ink-text-input`, because those packages internally depend on stock Ink and would break under the copied renderer

That is the narrowest technically sound path that still preserves the user-facing scope.

### Task 1: Bootstrap the copied renderer and local `#ink` facade

**Files:**
- Create: `scripts/vendor/restore-vendor-source.mjs`
- Create: `src/vendor/ink/**`
- Create: `src/vendor/components/FullscreenLayout.tsx`
- Create: `src/vendor/bootstrap/state.ts`
- Create: `src/vendor/native-ts/yoga-layout/index.ts`
- Create: `src/vendor/utils/debug.ts`
- Create: `src/vendor/utils/log.ts`
- Create: `src/vendor/utils/env.ts`
- Create: `src/vendor/utils/envUtils.ts`
- Create: `src/vendor/utils/fullscreen.ts`
- Create: `src/vendor/utils/intl.ts`
- Create: `src/vendor/utils/sliceAnsi.ts`
- Create: `src/vendor/utils/execFileNoThrow.ts`
- Create: `src/vendor/utils/earlyInput.ts`
- Create: `src/vendor/utils/semver.ts`
- Create: `src/ink/index.ts`
- Create: `src/ink/use-terminal-size.ts`
- Create: `src/ink/testing.tsx`
- Test: `src/ink/testing.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing renderer smoke test**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Box, Text } from '#ink';
import { renderTui } from '#ink/testing';

describe('renderTui', () => {
  it('captures the latest frame from the copied renderer', async () => {
    const app = await renderTui(
      <Box flexDirection="column">
        <Text>lap delta</Text>
        <Text>tyre temp</Text>
      </Box>,
      { columns: 24, rows: 8 },
    );

    expect(app.lastFrame()).toContain('lap delta');
    expect(app.lastFrame()).toContain('tyre temp');

    app.unmount();
  });
});
```

- [ ] **Step 2: Run the targeted test to confirm the facade does not exist yet**

```bash
npm test -- src/ink/testing.test.tsx
```

Expected: FAIL with a module-resolution error for `#ink` or `#ink/testing`.

- [ ] **Step 3: Copy the runtime, restore original source, and add the local facade**

```bash
mkdir -p scripts/vendor src/vendor src/ink
cp -R /Users/shayne/code/claude-code/ink /Users/shayne/code/f1aire/src/vendor/
cp /Users/shayne/code/claude-code/components/FullscreenLayout.tsx \
  /Users/shayne/code/f1aire/src/vendor/components/FullscreenLayout.tsx
node scripts/vendor/restore-vendor-source.mjs
npm install auto-bind @alcalzone/ansi-tokenize bidi-js chalk cli-boxes emoji-regex figures get-east-asian-width indent-string lodash-es react-reconciler semver signal-exit strip-ansi supports-hyperlinks type-fest usehooks-ts wrap-ansi
```

```js
// scripts/vendor/restore-vendor-source.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const files = globSync('src/vendor/**/*.{ts,tsx,js,jsx}');

for (const file of files) {
  const input = readFileSync(file, 'utf8');
  const marker = 'sourceMappingURL=data:application/json;charset=utf-8;base64,';
  const idx = input.lastIndexOf(marker);
  if (idx < 0) continue;
  const encoded = input.slice(idx + marker.length).trim();
  const map = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const source = map.sourcesContent?.[0];
  if (!source) continue;

  const normalized = source
    .replaceAll("from 'src/bootstrap/state.js'", "from '../bootstrap/state.js'")
    .replaceAll("from 'src/native-ts/yoga-layout/index.js'", "from '../native-ts/yoga-layout/index.js'")
    .replaceAll("from 'src/utils/debug.js'", "from '../utils/debug.js'")
    .replaceAll("from 'src/utils/log.js'", "from '../utils/log.js'");

  writeFileSync(file, normalized, 'utf8');
}
```

```ts
// src/vendor/bootstrap/state.ts
let lastInteractionTime = Date.now();
let lastScrollActivity = 0;

export function updateLastInteractionTime(): void {
  lastInteractionTime = Date.now();
}

export function flushInteractionTime(): number {
  return lastInteractionTime;
}

export function markScrollActivity(): void {
  lastScrollActivity = Date.now();
}

export function getLastScrollActivity(): number {
  return lastScrollActivity;
}
```

```ts
// src/vendor/native-ts/yoga-layout/index.ts
import Yoga, {
  Align,
  Direction,
  Display,
  Edge,
  FlexDirection,
  Gutter,
  Justify,
  MeasureMode,
  Overflow,
  PositionType,
  Wrap,
} from 'yoga-layout';

export { Align, Direction, Display, Edge, FlexDirection, Gutter, Justify, MeasureMode, Overflow, PositionType, Wrap };
export type { Node } from 'yoga-layout';
export default Yoga;

export function getYogaCounters() {
  return { visited: 0, measured: 0, cacheHits: 0, live: 0 };
}
```

```ts
// src/ink/index.ts
export { default as render, createRoot, renderSync } from '../vendor/ink/root.js';
export { default as Box } from '../vendor/ink/components/Box.js';
export { default as Text } from '../vendor/ink/components/Text.js';
export { default as Button } from '../vendor/ink/components/Button.js';
export { default as Link } from '../vendor/ink/components/Link.js';
export { default as AlternateScreen } from '../vendor/ink/components/AlternateScreen.js';
export { default as ScrollBox } from '../vendor/ink/components/ScrollBox.js';
export type { ScrollBoxHandle } from '../vendor/ink/components/ScrollBox.js';
export { default as useInput } from '../vendor/ink/hooks/use-input.js';
export { default as useApp } from '../vendor/ink/hooks/use-app.js';
export { default as useStdin } from '../vendor/ink/hooks/use-stdin.js';
export { useTerminalSize } from './use-terminal-size.js';
export type { BoxProps } from '../vendor/ink/components/Box.js';
export type { Key } from '../vendor/ink/events/keyboard-event.js';
```

```ts
// src/ink/use-terminal-size.ts
import { useContext } from 'react';
import {
  TerminalSizeContext,
  type TerminalSize,
} from '../vendor/ink/components/TerminalSizeContext.js';

export function useTerminalSize(): TerminalSize {
  return (
    useContext(TerminalSizeContext) ?? {
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    }
  );
}
```

```tsx
// src/ink/testing.tsx
import { PassThrough } from 'node:stream';
import React from 'react';
import { renderSync } from './index.js';

export async function renderTui(
  node: React.ReactNode,
  { columns = 80, rows = 24 } = {},
) {
  const stdout = new PassThrough() as PassThrough & NodeJS.WriteStream;
  const stdin = new PassThrough() as PassThrough & NodeJS.ReadStream;
  const stderr = new PassThrough() as PassThrough & NodeJS.WriteStream;
  let frame = '';

  stdout.columns = columns;
  stdout.rows = rows;
  stdout.isTTY = true;
  stdout.on('data', (chunk) => {
    frame += chunk.toString('utf8');
  });

  stdin.isTTY = true;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;

  const app = renderSync(node, { stdout, stdin, stderr, patchConsole: false });

  return {
    ...app,
    stdin,
    stdout,
    stderr,
    lastFrame: () => frame,
    resize(nextColumns: number, nextRows: number) {
      stdout.columns = nextColumns;
      stdout.rows = nextRows;
      stdout.emit('resize');
    },
  };
}
```

```json
// package.json
{
  "imports": {
    "#ink": "./src/ink/index.ts",
    "#ink/testing": "./src/ink/testing.tsx"
  }
}
```

- [ ] **Step 4: Run the smoke test and typecheck the vendored runtime**

```bash
npm test -- src/ink/testing.test.tsx
npm run typecheck
```

Expected: PASS. The smoke test renders and `typecheck` succeeds with the local vendor support files in place.

- [ ] **Step 5: Commit the renderer bootstrap**

```bash
git add package.json package-lock.json scripts/vendor/restore-vendor-source.mjs src/ink src/vendor src/ink/testing.test.tsx
git commit -m "feat: add fullscreen renderer facade"
```

### Task 2: Replace stock Ink widgets with local compatibility primitives

**Files:**
- Create: `src/tui/components/MenuList.tsx`
- Create: `src/tui/components/MenuList.test.tsx`
- Create: `src/tui/components/SecretTextInput.tsx`
- Create: `src/tui/components/SecretTextInput.test.tsx`
- Modify: `src/tui/components/SelectList.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.tsx`
- Modify: `src/tui/screens/SeasonPicker.tsx`
- Modify: `src/tui/screens/MeetingPicker.tsx`
- Modify: `src/tui/screens/SessionPicker.tsx`
- Modify: `src/tui/screens/Settings.tsx`

- [ ] **Step 1: Write failing tests for the compatibility widgets**

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { MenuList } from './MenuList.js';

describe('MenuList', () => {
  it('moves the highlight with arrow keys and submits on enter', async () => {
    const onSelect = vi.fn();
    const ui = await renderTui(
      <MenuList
        items={[
          { label: '2026', value: 2026 },
          { label: '2025', value: 2025 },
        ]}
        onSelect={onSelect}
      />,
    );

    ui.stdin.write('\u001b[B');
    ui.stdin.write('\r');

    expect(onSelect).toHaveBeenCalledWith(2025);
  });
});
```

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { SecretTextInput } from './SecretTextInput.js';

describe('SecretTextInput', () => {
  it('masks text and submits the trimmed value on enter', async () => {
    const onSubmit = vi.fn();
    const ui = await renderTui(
      <SecretTextInput value="" onChange={() => {}} onSubmit={onSubmit} />,
    );

    ui.stdin.write('s');
    ui.stdin.write('k');
    ui.stdin.write('-');
    ui.stdin.write('\r');

    expect(ui.lastFrame()).toContain('***');
    expect(onSubmit).toHaveBeenCalledWith('sk-');
  });
});
```

- [ ] **Step 2: Run the targeted widget tests and confirm they fail**

```bash
npm test -- src/tui/components/MenuList.test.tsx src/tui/components/SecretTextInput.test.tsx
```

Expected: FAIL because the local components do not exist yet.

- [ ] **Step 3: Implement the local widgets on the copied runtime**

```tsx
// src/tui/components/MenuList.tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from '#ink';
import { theme } from '../theme.js';

export function MenuList<V>({
  items,
  onSelect,
  onHighlight,
}: {
  items: Array<{ key?: string; label: string; value: V }>;
  onSelect: (item: V) => void;
  onHighlight?: (item: V) => void;
}) {
  const [index, setIndex] = useState(0);
  const current = items[index] ?? null;

  useInput((_input, key) => {
    if (key.upArrow) {
      const next = Math.max(index - 1, 0);
      setIndex(next);
      onHighlight?.(items[next]!.value);
      return;
    }
    if (key.downArrow) {
      const next = Math.min(index + 1, items.length - 1);
      setIndex(next);
      onHighlight?.(items[next]!.value);
      return;
    }
    if (key.return && current) {
      onSelect(current.value);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      {items.map((item, itemIndex) => (
        <Text key={item.key ?? item.label} color={itemIndex === index ? theme.accent : undefined}>
          {itemIndex === index ? '› ' : '  '}
          {item.label}
        </Text>
      ))}
    </Box>
  );
}
```

```tsx
// src/tui/components/SecretTextInput.tsx
import React, { useEffect, useState } from 'react';
import { Text, useInput } from '#ink';

export function SecretTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'sk-...',
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useInput((input, key) => {
    if (key.return) {
      const trimmed = draft.trim();
      if (trimmed) onSubmit(trimmed);
      return;
    }
    if (key.backspace || key.delete) {
      const next = draft.slice(0, -1);
      setDraft(next);
      onChange(next);
      return;
    }
    if (input.length > 0) {
      const next = `${draft}${input}`;
      setDraft(next);
      onChange(next);
    }
  });

  return <Text>{draft.length === 0 ? placeholder : '*'.repeat(draft.length)}</Text>;
}
```

```tsx
// src/tui/components/SelectList.tsx
import React from 'react';
import { MenuList } from './MenuList.js';

export function SelectList<V>({
  items,
  onSelect,
  onHighlight,
}: {
  items: Array<{ key?: string; label: string; value: V }>;
  onSelect: (item: V) => void;
  onHighlight?: (item: V) => void;
}) {
  return <MenuList items={items} onSelect={onSelect} onHighlight={onHighlight} />;
}
```

```tsx
// src/tui/screens/ApiKeyPrompt.tsx
<Box>
  <Text color={theme.muted}>› </Text>
  <SecretTextInput
    value={input}
    onChange={setInput}
    onSubmit={handleSubmit}
    placeholder="sk-..."
  />
</Box>
```

- [ ] **Step 4: Run the widget tests plus the affected screen tests**

```bash
npm test -- src/tui/components/MenuList.test.tsx src/tui/components/SecretTextInput.test.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Settings.test.tsx
```

Expected: PASS. The compatibility widgets work without `ink-select-input` or `ink-text-input`.

- [ ] **Step 5: Commit the compatibility widgets**

```bash
git add src/tui/components/MenuList.tsx src/tui/components/MenuList.test.tsx src/tui/components/SecretTextInput.tsx src/tui/components/SecretTextInput.test.tsx src/tui/components/SelectList.tsx src/tui/screens/ApiKeyPrompt.tsx src/tui/screens/SeasonPicker.tsx src/tui/screens/MeetingPicker.tsx src/tui/screens/SessionPicker.tsx src/tui/screens/Settings.tsx
git commit -m "feat: add local terminal input primitives"
```

### Task 3: Swap the app tree onto the local renderer facade

**Files:**
- Modify: `src/index.tsx`
- Modify: `src/app.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: every `src/**/*.tsx` file that still imports from `'ink'`
- Modify: every `src/**/*.test.tsx` file that still imports `render` from `ink-testing-library`

- [ ] **Step 1: Rewrite one app-level test and one engineer test to the new harness**

```tsx
// src/app-openai-key.test.tsx
import { renderTui } from '#ink/testing';
// ...
const { lastFrame } = await renderTui(<App />, { columns: 100, rows: 40 });
```

```tsx
// src/tui/screens/EngineerChat.test.tsx
import { renderTui } from '#ink/testing';
// ...
const { stdin, lastFrame } = await renderTui(<EngineerChat {...baseProps} />);
```

- [ ] **Step 2: Run the two migrated tests and confirm they fail before the renderer swap**

```bash
npm test -- src/app-openai-key.test.tsx src/tui/screens/EngineerChat.test.tsx
```

Expected: FAIL due to mixed host-renderer imports still present in the app tree.

- [ ] **Step 3: Replace stock Ink imports with `#ink`, swap the root renderer, and replace `useStdout` with `useTerminalSize`**

```bash
perl -0pi -e "s/from 'ink'/from '#ink'/g" \
  src/app.tsx \
  src/index.tsx \
  src/tui/components/FooterHints.tsx \
  src/tui/components/Header.tsx \
  src/tui/components/Panel.tsx \
  src/tui/components/SelectList.tsx \
  src/tui/screens/ApiKeyPrompt.tsx \
  src/tui/screens/Downloading.tsx \
  src/tui/screens/EngineerChat.tsx \
  src/tui/screens/MeetingPicker.tsx \
  src/tui/screens/RuntimePreparing.tsx \
  src/tui/screens/SeasonPicker.tsx \
  src/tui/screens/SessionPicker.tsx \
  src/tui/screens/Settings.tsx \
  src/tui/screens/Summary.tsx \
  src/tui/screens/engineer/Composer.tsx \
  src/tui/screens/engineer/EngineerDetails.tsx \
  src/tui/screens/engineer/transcript-rows.ts \
  src/tui/screens/engineer/useComposerState.ts \
  src/tui/screens/engineer/useTranscriptViewport.ts \
  src/tui/screens/engineer/TranscriptViewport.tsx
```

```ts
// src/index.tsx
#!/usr/bin/env node

import React from 'react';
import { render } from '#ink';
import { App } from './app.js';

render(<App />);
```

```ts
// src/app.tsx
import { Box, useInput } from '#ink';
import { useTerminalSize } from '#ink';
// ...
const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
```

```ts
// src/tui/screens/EngineerChat.tsx
import { Box, type Key } from '#ink';
import { useTerminalSize } from '#ink';
// ...
const { columns, rows: terminalRows } = useTerminalSize();
const rows = maxHeight ?? terminalRows;
```

- [ ] **Step 4: Run the migrated tests, then migrate the rest of the Ink tests to `renderTui`**

```bash
npm test -- src/app-openai-key.test.tsx src/tui/screens/EngineerChat.test.tsx
npm test -- src/tui/components/FooterHints.test.tsx src/tui/screens/RuntimePreparing.test.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Settings.test.tsx src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/engineer/EngineerTranscriptHint.test.tsx src/tui/screens/engineer/useComposerState.test.ts src/tui/screens/engineer/TranscriptViewport.test.tsx src/tui/screens/engineer/EngineerWorkspaceToggle.test.tsx src/tui/screens/engineer/useTranscriptViewport.hook.test.tsx
```

Expected: PASS after every test file uses `#ink/testing`.

- [ ] **Step 5: Commit the renderer swap**

```bash
git add src/index.tsx src/app.tsx src/tui src/ink package.json package-lock.json
git commit -m "refactor: route app through local terminal renderer"
```

### Task 4: Add the engineer fullscreen shell and compact session strip

**Files:**
- Create: `src/tui/screens/engineer/EngineerShell.tsx`
- Create: `src/tui/screens/engineer/EngineerShell.test.tsx`
- Create: `src/tui/screens/engineer/EngineerSessionStrip.tsx`
- Modify: `src/vendor/components/FullscreenLayout.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/engineer/EngineerDetails.tsx`

- [ ] **Step 1: Write the failing shell-structure test**

```tsx
import React from 'react';
import { describe, expect, it } from 'vitest';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import { EngineerShell } from './EngineerShell.js';

describe('EngineerShell', () => {
  it('renders a compact session strip, scrollable transcript slot, and pinned bottom slot', async () => {
    const ui = await renderTui(
      <EngineerShell
        top={<Text>2026 Monaco GP · Race · Latest</Text>}
        scrollable={<Text>Sector 2 is the weak point.</Text>}
        bottom={<Text>› push now</Text>}
      />,
      { columns: 80, rows: 18 },
    );

    const frame = ui.lastFrame();
    expect(frame).toContain('2026 Monaco GP · Race · Latest');
    expect(frame).toContain('Sector 2 is the weak point.');
    expect(frame).toContain('› push now');
  });
});
```

- [ ] **Step 2: Run the shell test to confirm the new shell does not exist yet**

```bash
npm test -- src/tui/screens/engineer/EngineerShell.test.tsx
```

Expected: FAIL because `EngineerShell` is not implemented.

- [ ] **Step 3: Implement the shell around the copied `FullscreenLayout`**

```tsx
// src/vendor/components/FullscreenLayout.tsx
import { Box, Button, ScrollBox, type ScrollBoxHandle } from '#ink';

export function FullscreenLayout({
  top,
  scrollable,
  bottom,
  scrollRef,
  dividerYRef,
  newMessageCount = 0,
  onPillClick,
}: {
  top?: React.ReactNode;
  scrollable: React.ReactNode;
  bottom: React.ReactNode;
  scrollRef?: React.RefObject<ScrollBoxHandle | null>;
  dividerYRef?: React.RefObject<number | null>;
  newMessageCount?: number;
  onPillClick?: () => void;
}) {
  return (
    <Box flexDirection="column" height="100%">
      {top ? <Box flexShrink={0}>{top}</Box> : null}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <ScrollBox ref={scrollRef} stickyScroll flexGrow={1}>
          {scrollable}
        </ScrollBox>
        {newMessageCount > 0 ? (
          <Box position="absolute" bottom={1} right={2}>
            <Button onClick={onPillClick}>{newMessageCount} new</Button>
          </Box>
        ) : null}
      </Box>
      <Box flexShrink={0}>{bottom}</Box>
    </Box>
  );
}
```

```tsx
// src/tui/screens/engineer/EngineerSessionStrip.tsx
import React from 'react';
import { Text } from '#ink';
import { theme } from '../../theme.js';

export function EngineerSessionStrip({ label }: { label: string }) {
  return (
    <Text color={theme.muted} wrap="truncate-end">
      {label}
    </Text>
  );
}
```

```tsx
// src/tui/screens/engineer/EngineerShell.tsx
import React from 'react';
import { AlternateScreen, Box } from '#ink';
import { FullscreenLayout } from '../../../vendor/components/FullscreenLayout.js';

export function EngineerShell({
  top,
  scrollable,
  bottom,
  scrollRef,
  dividerYRef,
  newMessageCount,
  onPillClick,
}: {
  top: React.ReactNode;
  scrollable: React.ReactNode;
  bottom: React.ReactNode;
  scrollRef?: React.RefObject<any>;
  dividerYRef?: React.RefObject<number | null>;
  newMessageCount?: number;
  onPillClick?: () => void;
}) {
  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" height="100%">
        <FullscreenLayout
          top={top}
          scrollable={scrollable}
          bottom={bottom}
          scrollRef={scrollRef}
          dividerYRef={dividerYRef}
          newMessageCount={newMessageCount}
          onPillClick={onPillClick}
        />
      </Box>
    </AlternateScreen>
  );
}
```

- [ ] **Step 4: Run the shell test and the existing engineer details test**

```bash
npm test -- src/tui/screens/engineer/EngineerShell.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx
```

Expected: PASS. The engineer shell exists and keeps the top strip visually lightweight.

- [ ] **Step 5: Commit the shell skeleton**

```bash
git add src/vendor/components/FullscreenLayout.tsx src/tui/screens/engineer/EngineerShell.tsx src/tui/screens/engineer/EngineerShell.test.tsx src/tui/screens/engineer/EngineerSessionStrip.tsx src/tui/screens/engineer/EngineerDetails.tsx
git commit -m "feat: add engineer fullscreen shell"
```

### Task 5: Move transcript scrolling onto `ScrollBox`

**Files:**
- Create: `src/tui/screens/engineer/useEngineerScrollState.ts`
- Create: `src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/EngineerChat.test.tsx`
- Delete or stop using: `src/tui/screens/engineer/TranscriptViewport.tsx`
- Delete or stop using: `src/tui/screens/engineer/useTranscriptViewport.ts`

- [ ] **Step 1: Add a failing scroll-behavior test for the engineer transcript**

```tsx
it('shows a jump-to-latest affordance after PageUp and clears it after PageDown', async () => {
  const ui = await renderTui(
    <EngineerChat {...baseProps} maxHeight={16} messages={makeMessages(20)} />,
    { columns: 90, rows: 16 },
  );

  ui.stdin.write('\u001b[5~');
  expect(ui.lastFrame()).toContain('Jump to latest');

  ui.stdin.write('\u001b[6~');
  expect(ui.lastFrame()).not.toContain('Jump to latest');
});
```

- [ ] **Step 2: Run the engineer transcript tests and confirm the old viewport math still fails this contract**

```bash
npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx
```

Expected: FAIL because `EngineerChat` still slices rows with `useTranscriptViewport`.

- [ ] **Step 3: Replace row slicing with `ScrollBoxHandle` state and the copied unseen-divider primitive**

```ts
// src/tui/screens/engineer/useEngineerScrollState.ts
import { useRef } from 'react';
import { type ScrollBoxHandle, useInput } from '#ink';
import { useUnseenDivider } from '../../../vendor/components/FullscreenLayout.js';

export function useEngineerScrollState(
  messageCount: number,
  pageSize: number,
  transcriptVersion: string,
) {
  const scrollRef = useRef<ScrollBoxHandle | null>(null);
  const { dividerIndex, dividerYRef, onScrollAway, onRepin, jumpToNew } =
    useUnseenDivider(messageCount);
  const pausedVersionRef = useRef<string | null>(null);

  useInput((_input, key) => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    if (key.pageUp) {
      scroll.scrollBy(-pageSize);
      onScrollAway(scroll);
      pausedVersionRef.current ??= transcriptVersion;
      return;
    }
    if (key.pageDown) {
      scroll.scrollBy(pageSize);
      if (scroll.isSticky()) {
        pausedVersionRef.current = null;
        onRepin();
      }
    }
  });

  return {
    scrollRef,
    dividerYRef,
    newMessageCount:
      dividerIndex === null || pausedVersionRef.current === transcriptVersion
        ? 0
        : 1,
    jumpToLatest: () => {
      jumpToNew(scrollRef.current);
      pausedVersionRef.current = null;
      onRepin();
    },
  };
}
```

```tsx
// src/tui/screens/EngineerChat.tsx
const scroll = useEngineerScrollState(
  conversationRows.length,
  Math.max(1, Math.floor(rows * 0.7)),
  transcriptVersion,
);

const transcript = (
  <Box flexDirection="column">
    {conversationRows.map((row) => (
      <Box key={row.key}>{row.node}</Box>
    ))}
  </Box>
);
```

- [ ] **Step 4: Run the transcript tests plus typecheck**

```bash
npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx
npm run typecheck
```

Expected: PASS. The engineer transcript scroll is now owned by `ScrollBox`, not manual row slicing.

- [ ] **Step 5: Commit the transcript migration**

```bash
git add src/tui/screens/EngineerChat.tsx src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/useEngineerScrollState.ts src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx src/tui/screens/engineer/TranscriptViewport.tsx src/tui/screens/engineer/useTranscriptViewport.ts
git commit -m "refactor: move engineer transcript onto scroll shell"
```

### Task 6: Pin the multiline composer in the bottom shell and keep transcript renders stable

**Files:**
- Modify: `src/tui/screens/engineer/useComposerState.ts`
- Modify: `src/tui/screens/engineer/Composer.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/EngineerChat.test.tsx`
- Modify: `src/tui/screens/engineer/useComposerState.test.ts`

- [ ] **Step 1: Add failing multiline and render-stability assertions**

```tsx
it('keeps transcript renders stable while typing into the composer', async () => {
  const onConversationRender = vi.fn();
  const ui = await renderTui(
    <EngineerChat {...baseProps} onConversationRender={onConversationRender} />,
  );

  ui.stdin.write('t');
  ui.stdin.write('y');
  ui.stdin.write('r');
  ui.stdin.write('e');

  expect(onConversationRender).toHaveBeenCalledTimes(1);
});

it('grows the composer for shift+enter without reducing the transcript to a manual viewport', async () => {
  const ui = await renderTui(<EngineerChat {...baseProps} maxHeight={20} />);

  ui.stdin.write('p');
  ui.stdin.write('\u001b[13;2u');
  ui.stdin.write('l');

  expect(ui.lastFrame()).toContain('› p');
  expect(ui.lastFrame()).toContain('  l');
});
```

- [ ] **Step 2: Run the composer tests to confirm the old layout assumptions fail**

```bash
npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/useComposerState.test.ts
```

Expected: FAIL while `EngineerChat` still calculates composer height into transcript height.

- [ ] **Step 3: Make the composer bottom-owned and transcript-independent**

```ts
// src/tui/screens/engineer/useComposerState.ts
export function useComposerState({
  onSend,
  isStreaming,
  initialDraft = '',
  onDraftChange,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
  initialDraft?: string;
  onDraftChange?: (draft: string) => void;
}) {
  // existing reducer stays, but seed from initialDraft and call onDraftChange
}
```

```tsx
// src/tui/screens/engineer/Composer.tsx
import { Box, Text } from '#ink';
import { useDeclaredCursor } from '../../../vendor/ink/hooks/use-declared-cursor.js';

export function Composer({ state, isStreaming, onInterceptInput }: Props) {
  useDeclaredCursor();

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.border} paddingX={1}>
      <Text color={theme.panelTitle}>Ask the engineer</Text>
      {/* render wrapped lines here without reporting height back upward */}
      <Text color={theme.muted}>
        enter send · shift+enter newline · tab details{isStreaming ? ' · streaming' : ''}
      </Text>
    </Box>
  );
}
```

```tsx
// src/tui/screens/EngineerChat.tsx
const transcriptNode = (
  <TranscriptSurface
    rows={conversationRows}
    scrollRef={scroll.scrollRef}
    onRender={onConversationRender}
  />
);

const composerNode = (
  <ComposerPanel
    onSend={onSend}
    isStreaming={isStreaming}
    width={composerContentWidth}
    onInterceptInput={handleComposerIntercept}
  />
);
```

- [ ] **Step 4: Run the composer tests and the full engineer suite**

```bash
npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/useComposerState.test.ts src/tui/screens/engineer/Composer.test.tsx
```

Expected: PASS. Typing stays local to the composer and multiline behavior no longer drives manual transcript layout math.

- [ ] **Step 5: Commit the pinned composer work**

```bash
git add src/tui/screens/engineer/useComposerState.ts src/tui/screens/engineer/Composer.tsx src/tui/screens/EngineerChat.tsx src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/useComposerState.test.ts
git commit -m "fix: pin multiline composer in engineer shell"
```

### Task 7: Integrate the engineer route with app chrome gating and finish verification

**Files:**
- Create: `src/app-engineer-shell.test.tsx`
- Modify: `src/app.tsx`
- Modify: `src/tui/components/FooterHints.tsx`
- Modify: `src/tui/components/Header.tsx`
- Delete or stop using: `src/tui/screens/engineer/TranscriptViewport.tsx`
- Delete or stop using: `src/tui/screens/engineer/useTranscriptViewport.ts`

- [ ] **Step 1: Add a failing app-level regression for engineer chrome**

```tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { App } from './app.js';

describe('App engineer shell', () => {
  it('removes the global header/footer on the engineer route', async () => {
    const ui = await renderTui(<App />, { columns: 100, rows: 40 });

    expect(ui.lastFrame()).not.toContain('F1aire - Virtual Race Engineer');
    expect(ui.lastFrame()).not.toContain('pgup/pgdn scroll/live · esc back');
  });
});
```

- [ ] **Step 2: Run the app regression and confirm it fails before the route gate**

```bash
npm test -- src/app-engineer-shell.test.tsx
```

Expected: FAIL because `App` still renders `Header` and `FooterHints` unconditionally.

- [ ] **Step 3: Gate global chrome by route and wire the engineer shell**

```tsx
// src/app.tsx
const showGlobalChrome = screen.name !== 'engineer';
const headerRows = showGlobalChrome
  ? breadcrumb.length
    ? isShort
      ? 4
      : 6
    : isShort
      ? 3
      : 4
  : 0;
const footerRows = showGlobalChrome
  ? getFooterHintRowCount(screen.name, terminalColumns)
  : 0;

return (
  <Box flexDirection="column" height={terminalRows}>
    {showGlobalChrome ? <Header breadcrumb={breadcrumb} compact={isShort} /> : null}
    <Box flexGrow={1} flexDirection="column" marginLeft={showGlobalChrome ? 1 : 0} height={contentHeight}>
      {/* route rendering stays the same except engineer uses EngineerChat shell */}
    </Box>
    {showGlobalChrome ? <FooterHints screen={screen.name} /> : null}
  </Box>
);
```

- [ ] **Step 4: Run full verification**

```bash
npm run typecheck
npm test
npm run build
```

Expected: PASS. The app is on the copied renderer, the engineer route owns its shell chrome, and the rest of the app still works.

- [ ] **Step 5: Commit the integration and cleanup**

```bash
git add src/app.tsx src/app-engineer-shell.test.tsx src/tui/components/FooterHints.tsx src/tui/components/Header.tsx src/tui/screens/engineer/TranscriptViewport.tsx src/tui/screens/engineer/useTranscriptViewport.ts
git commit -m "refactor: remove global chrome from engineer route"
```

## Self-Review

### Spec coverage

- Transcript-first fullscreen shell: covered by Tasks 4, 5, and 7.
- Copied custom runtime owned inside `f1aire`: covered by Task 1.
- Compact in-shell status strip: covered by Task 4.
- Pinned bottom composer with multiline behavior: covered by Task 6.
- `App` remains the owner of navigation and engineer session state: preserved in Task 7.
- Engineer-only shell migration with app-wide renderer prerequisite: reflected in the implementation note, Task 3, and Task 7.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” markers remain.
- Each task includes explicit files, commands, and representative code.
- Dependency and renderer prerequisites are called out directly instead of hidden behind “fix imports”.

### Type consistency

- `#ink` is the single import facade for runtime components and hooks.
- `renderTui` is the single test harness API across renderer-backed tests.
- `EngineerShell` owns `top`, `scrollable`, and `bottom`; `App` still owns route state and business logic.
