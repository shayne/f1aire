# App UX Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the entire `f1aire` TUI so the app launches with clear product identity, the engineer screen is immediately promptable, and all screens feel well-framed and visually calm on first render.

**Architecture:** Keep the existing screen flow and engineer shell structure, but move the visual system onto shared UI primitives and lighter theme tokens. Use shared component changes for header, footer hints, panels, and menus, then layer responsive screen layouts and engineer-specific onboarding/chrome updates on top.

**Tech Stack:** React, copied Ink runtime (`#ink`), Vitest, `ink-testing-library`, tmux-driven live preview via `npm run dev`

---

### Task 1: Refresh Shared UI Tokens And Chrome

**Files:**
- Create: `src/tui/components/Header.test.tsx`
- Create: `src/tui/components/Panel.test.tsx`
- Modify: `src/tui/theme.ts`
- Modify: `src/tui/components/Header.tsx`
- Modify: `src/tui/components/Panel.tsx`
- Modify: `src/tui/components/FooterHints.tsx`
- Modify: `src/tui/components/FooterHints.test.tsx`
- Modify: `src/tui/components/MenuList.tsx`
- Modify: `src/tui/components/MenuList.test.tsx`

- [ ] **Step 1: Write the failing shared-chrome tests**

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { Header } from './Header.js';

describe('Header', () => {
  it('renders a branded masthead with quieter breadcrumbs', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Header
        breadcrumb={['2026', 'Bahrain', 'Day 1']}
        title="f1aire - Virtual Race Engineer"
      />,
      { columns: 100, rows: 12 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('f1aire');
    expect(frame).toContain('Virtual Race Engineer');
    expect(frame).toContain('2026 / Bahrain / Day 1');
    unmount();
  });
});
```

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { Panel } from './Panel.js';

describe('Panel', () => {
  it('renders muted framing without a heavy title gap', async () => {
    const { lastFrame, unmount } = await renderTui(
      <Panel title="Session" tone="muted">
        body copy
      </Panel>,
      { columns: 60, rows: 10 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Session');
    expect(frame).toContain('body copy');
    unmount();
  });
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm test -- src/tui/components/Header.test.tsx src/tui/components/Panel.test.tsx src/tui/components/FooterHints.test.tsx src/tui/components/MenuList.test.tsx`

Expected: FAIL because `Header.test.tsx` and `Panel.test.tsx` do not exist yet and the current chrome does not match the new expectations.

- [ ] **Step 3: Implement the shared theme and chrome refresh**

```ts
export const theme = {
  brand: 'green',
  accent: 'cyan',
  text: 'white',
  muted: 'gray',
  subtle: 'blackBright',
  border: 'blackBright',
  success: 'green',
  warning: 'yellow',
  error: 'red',
} as const;
```

```tsx
export function Header({ breadcrumb = [], title = 'f1aire - Virtual Race Engineer', compact = false }: HeaderProps) {
  const [brand, tagline] = title.split(' - ');

  return (
    <Box flexDirection="column" marginBottom={compact ? 0 : 1}>
      <Text color="ansi:green" bold>{brand}</Text>
      {!compact && tagline ? <Text color="ansi:blackBright">{tagline}</Text> : null}
      {breadcrumb.length > 0 ? (
        <Text color="ansi:blackBright" wrap="truncate-end">
          {breadcrumb.join(' / ')}
        </Text>
      ) : null}
    </Box>
  );
}
```

```tsx
export function Panel({ title, children, tone = 'neutral', boxProps }: PanelProps) {
  const borderColor = tone === 'accent' ? 'ansi:cyan' : 'ansi:blackBright';
  const titleColor = tone === 'accent' ? 'ansi:cyan' : 'ansi:blackBright';

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
      {...boxProps}
    >
      <Text color={titleColor}>{title}</Text>
      <Box flexDirection="column">{children}</Box>
    </Box>
  );
}
```

```tsx
export function FooterHints({ screen }: { screen: string }) {
  return <Text color="ansi:blackBright">{getFooterHintText(screen)}</Text>;
}
```

Use this implementation pass to shorten the footer hint copy and make `MenuList` match the calmer selection style.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm test -- src/tui/components/Header.test.tsx src/tui/components/Panel.test.tsx src/tui/components/FooterHints.test.tsx src/tui/components/MenuList.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit the shared chrome refresh**

```bash
git add src/tui/theme.ts src/tui/components/Header.tsx src/tui/components/Header.test.tsx src/tui/components/Panel.tsx src/tui/components/Panel.test.tsx src/tui/components/FooterHints.tsx src/tui/components/FooterHints.test.tsx src/tui/components/MenuList.tsx src/tui/components/MenuList.test.tsx
git commit -m "ux: refine shared terminal chrome"
```

### Task 2: Make Picker And Task Screens Read Cleanly On First Render

**Files:**
- Create: `src/tui/components/ScreenLayout.tsx`
- Create: `src/tui/components/ScreenLayout.test.tsx`
- Create: `src/tui/screens/SeasonPicker.test.tsx`
- Create: `src/tui/screens/MeetingPicker.test.tsx`
- Create: `src/tui/screens/SessionPicker.test.tsx`
- Create: `src/tui/screens/Downloading.test.tsx`
- Modify: `src/tui/screens/SeasonPicker.tsx`
- Modify: `src/tui/screens/MeetingPicker.tsx`
- Modify: `src/tui/screens/SessionPicker.tsx`
- Modify: `src/tui/screens/Settings.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.test.tsx`
- Modify: `src/tui/screens/Downloading.tsx`
- Modify: `src/tui/screens/Summary.tsx`

- [ ] **Step 1: Write the failing layout tests**

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { ScreenLayout } from './ScreenLayout.js';

describe('ScreenLayout', () => {
  it('stacks the detail panel below the main content on narrow terminals', async () => {
    const { lastFrame, unmount } = await renderTui(
      <ScreenLayout
        title="Select a season"
        main={<Text>main pane</Text>}
        detail={<Text>detail pane</Text>}
      />,
      { columns: 64, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    expect(frame.indexOf('main pane')).toBeLessThan(frame.indexOf('detail pane'));
    unmount();
  });
});
```

```tsx
import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
import { SeasonPicker } from './SeasonPicker.js';

describe('SeasonPicker', () => {
  it('shows the active list and detail copy without clipping on a narrow terminal', async () => {
    const { lastFrame, unmount } = await renderTui(
      <SeasonPicker onSelect={() => {}} />,
      { columns: 72, rows: 20 },
    );

    const frame = lastFrame() ?? '';
    expect(frame).toContain('Select a season');
    expect(frame).toContain('Pick a year');
    unmount();
  });
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm test -- src/tui/components/ScreenLayout.test.tsx src/tui/screens/SeasonPicker.test.tsx src/tui/screens/MeetingPicker.test.tsx src/tui/screens/SessionPicker.test.tsx src/tui/screens/Downloading.test.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Settings.test.tsx`

Expected: FAIL because the new `ScreenLayout` does not exist and the current screens do not apply stacked responsive framing.

- [ ] **Step 3: Implement shared screen layout and task-state cleanup**

```tsx
export function ScreenLayout({
  title,
  main,
  detail,
  columns,
}: ScreenLayoutProps) {
  const isStacked = columns < 84;

  if (isStacked) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text>{title}</Text>
        <Box flexDirection="column">{main}</Box>
        <Box flexDirection="column">{detail}</Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>{main}</Box>
      <Box width={36} flexShrink={0}>{detail}</Box>
    </Box>
  );
}
```

```tsx
return (
  <ScreenLayout
    title="Select a season"
    main={
      <SelectList
        items={seasons.map((year) => ({ label: String(year), value: year }))}
        onSelect={onSelect}
        onHighlight={setHighlighted}
      />
    }
    detail={
      <Panel title="Season" tone="muted">
        <Text>{detailYear ? `Year ${detailYear}` : 'Pick a year'}</Text>
        <Text color="ansi:blackBright">Start with a season, then choose an event and session.</Text>
      </Panel>
    }
  />
);
```

```tsx
return (
  <Panel title="Preparing session" tone="accent" paddingY={1}>
    <Box flexDirection="column">
      <Text>{meeting.Name}</Text>
      <Text color="ansi:blackBright">{session.Name}</Text>
      <Text>{status}</Text>
    </Box>
  </Panel>
);
```

Use the same pass to make `ApiKeyPrompt` and `Summary` read like centered, deliberate task states rather than ad hoc panels.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm test -- src/tui/components/ScreenLayout.test.tsx src/tui/screens/SeasonPicker.test.tsx src/tui/screens/MeetingPicker.test.tsx src/tui/screens/SessionPicker.test.tsx src/tui/screens/Downloading.test.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Settings.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit the screen layout pass**

```bash
git add src/tui/components/ScreenLayout.tsx src/tui/components/ScreenLayout.test.tsx src/tui/screens/SeasonPicker.tsx src/tui/screens/SeasonPicker.test.tsx src/tui/screens/MeetingPicker.tsx src/tui/screens/MeetingPicker.test.tsx src/tui/screens/SessionPicker.tsx src/tui/screens/SessionPicker.test.tsx src/tui/screens/Settings.tsx src/tui/screens/ApiKeyPrompt.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Downloading.tsx src/tui/screens/Downloading.test.tsx src/tui/screens/Summary.tsx
git commit -m "ux: improve screen framing across the app"
```

### Task 3: Make The Engineer Screen Immediately Promptable And More Editorial

**Files:**
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/EngineerChat.test.tsx`
- Modify: `src/tui/screens/engineer/transcript-rows.ts`
- Modify: `src/tui/screens/engineer/transcript-rows.test.ts`
- Modify: `src/tui/screens/engineer/Composer.tsx`
- Modify: `src/tui/screens/engineer/Composer.test.tsx`
- Modify: `src/tui/screens/engineer/EngineerDetails.tsx`
- Modify: `src/tui/screens/engineer/EngineerDetails.test.tsx`
- Modify: `src/tui/screens/engineer/EngineerSessionStrip.tsx`

- [ ] **Step 1: Write the failing engineer onboarding and transcript tests**

```tsx
it('shows a muted opening guidance note when the engineer conversation is empty', async () => {
  const { lastFrame, unmount } = await renderTui(
    <EngineerChat {...baseProps} maxHeight={18} />,
  );

  const frame = stripAnsi(lastFrame() ?? '');
  expect(frame).toContain('Ask about pace, tyres, pit windows, or traffic');
  unmount();
});
```

```ts
it('renders calmer speaker markers instead of saturated role labels', () => {
  const rows = buildTranscriptRows({
    messages: [{ role: 'assistant', content: 'Stint pace is stable.' }],
    streamingText: '',
    isStreaming: false,
    status: null,
    messageWidth: 40,
  });

  expect(rows.some((row) => row.plainText === 'Engineer')).toBe(false);
  expect(rows.some((row) => row.plainText.includes('Stint pace is stable.'))).toBe(true);
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx`

Expected: FAIL because the empty-state note and quieter transcript treatment do not exist yet.

- [ ] **Step 3: Implement the engineer polish pass**

```ts
function createEmptyStateRows(messageWidth: number): TranscriptRow[] {
  return [
    {
      key: 'intro-note',
      kind: 'message-line',
      plainText: 'Ask about pace, tyres, pit windows, or traffic.',
      node: (
        <Text color="ansi:blackBright" wrap="wrap">
          Ask about pace, tyres, pit windows, or traffic.
        </Text>
      ),
    },
    createSpacerRow('intro-spacer'),
  ];
}
```

```ts
const rows: TranscriptRow[] = messages.length === 0
  ? createEmptyStateRows(messageWidth)
  : [];
```

```tsx
<Text color="ansi:blackBright">
  Ask about pace trends, tyre life, traffic, or strategy...
</Text>
```

```tsx
<Text color="ansi:blackBright" wrap="truncate-end">
  {label}
</Text>
```

```tsx
<Text color="ansi:blackBright" wrap="truncate-end">
  {`Status · ${latestActivity}`}
</Text>
```

Use this pass to remove strong green/cyan speaker labeling, keep transcript content mostly default foreground, and make the composer and details read like supporting chrome rather than boxed widgets.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit the engineer UX pass**

```bash
git add src/tui/screens/EngineerChat.tsx src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/transcript-rows.ts src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/Composer.tsx src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/EngineerDetails.tsx src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/engineer/EngineerSessionStrip.tsx
git commit -m "ux: clarify the engineer workflow"
```

### Task 4: Preview In Tmux, Refine The Edges, And Finish Cleanly

**Files:**
- Modify: `src/app.tsx`
- Modify: any files from Tasks 1-3 needed to address issues found during live preview

- [ ] **Step 1: Run full automated verification before preview**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands exit 0.

- [ ] **Step 2: Run the live tmux preview workflow**

Run:

```bash
python /Users/shayne/code/skills/skills/terminal-controller/scripts/tmux_control.py create --name f1aire-ux-refresh --cwd /Users/shayne/code/f1aire --force --width 120 --height 40
python /Users/shayne/code/skills/skills/terminal-controller/scripts/tmux_control.py step --target f1aire-ux-refresh:0.0 --text "npm run dev" --enter --sleep-ms 1500 --lines 120
```

Then walk through:

- season picker
- meeting picker
- session picker
- downloading / transition state
- engineer first landing
- multiline composer input
- transcript scroll state with `PageUp` / `PageDown`

Capture ANSI output with:

```bash
tmux capture-pane -t f1aire-ux-refresh:0.0 -p -e -S -120 | tail -120
```

Expected: the launch screens feel branded but calm, the engineer screen shows a clear onboarding note plus a strong placeholder, and no important element feels cut off or cramped on first render.

- [ ] **Step 3: Fix any preview issues immediately and re-run the narrow verification**

```bash
npm test -- src/tui/components/Header.test.tsx src/tui/components/Panel.test.tsx src/tui/components/FooterHints.test.tsx src/tui/components/MenuList.test.tsx src/tui/components/ScreenLayout.test.tsx src/tui/screens/SeasonPicker.test.tsx src/tui/screens/MeetingPicker.test.tsx src/tui/screens/SessionPicker.test.tsx src/tui/screens/Downloading.test.tsx src/tui/screens/ApiKeyPrompt.test.tsx src/tui/screens/Settings.test.tsx src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/Composer.test.tsx src/tui/screens/engineer/EngineerDetails.test.tsx
```

Expected: PASS with 0 failures after the preview fixes land.

- [ ] **Step 4: Run fresh final verification**

Run: `npm run typecheck && npm test && npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit, push, and verify the branch is clean**

```bash
git add src/app.tsx src/tui
git commit -m "ux: polish the race engineer interface"
git push origin main
git status -sb
```

Expected: `## main...origin/main` with no uncommitted changes.
