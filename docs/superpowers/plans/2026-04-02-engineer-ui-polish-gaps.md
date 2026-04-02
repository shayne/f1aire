# Engineer UI Polish Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining engineer-screen UI gaps so the composer reads correctly as an input, the default-open details area stays usable on short terminals, and status/scroll chrome feels calm and intentional.

**Architecture:** Keep the current engineer shell and fullscreen scroll container intact. Make targeted, test-first refinements inside the composer, details panel, transcript rows, and shell chrome so the screen remains transcript-first without regressing the copied scroll structure or root render isolation.

**Tech Stack:** React, copied Ink runtime (`#ink`), Vitest, `ink-testing-library`, tmux live preview via `npm run dev`

---

### Task 1: Make Composer Placeholder And Cursor Semantics Visually Distinct

**Files:**
- Modify: `src/tui/screens/engineer/Composer.tsx`
- Modify: `src/tui/screens/engineer/Composer.test.tsx`

- [ ] **Step 1: Write the failing placeholder test**

```tsx
it('renders the empty prompt placeholder in a muted style and keeps typed text in the normal foreground', async () => {
  const { stdin, lastFrame, unmount } = await renderTui(
    <Harness onSend={vi.fn()} />,
  );

  const placeholderFrame = lastFrame() ?? '';
  expect(placeholderFrame).toContain('\u001b[90mAsk the engineer about pace');

  await waitForTick();
  stdin.write('pace?');
  await waitForTick();

  const typedFrame = lastFrame() ?? '';
  expect(typedFrame).toContain('pace?');
  expect(typedFrame).not.toContain(
    '\u001b[90mpace?\u001b[39m',
  );
  unmount();
});
```

- [ ] **Step 2: Run the composer test to verify RED**

Run: `npm test -- src/tui/screens/engineer/Composer.test.tsx`

Expected: FAIL because the placeholder text is currently rendered with the same foreground style as entered text.

- [ ] **Step 3: Implement muted placeholder rendering**

Render the placeholder branch with `theme.subtle`, keep typed text as the default foreground, and preserve the visible cyan cursor block only on active draft text. Do not change the composer state model or add a new render path that would reintroduce root re-renders while typing.

- [ ] **Step 4: Run the composer test to verify GREEN**

Run: `npm test -- src/tui/screens/engineer/Composer.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/tui/screens/engineer/Composer.tsx src/tui/screens/engineer/Composer.test.tsx
git commit -m "ux: clarify engineer composer placeholder"
```

### Task 2: Keep Default-Open Details Useful On Short Terminals

**Files:**
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/screens/EngineerChat.test.tsx`
- Modify: `src/tui/screens/engineer/EngineerWorkspaceToggle.test.tsx`

- [ ] **Step 1: Write the failing compact-height details tests**

```tsx
it('collapses details by default on compact terminals so the first render still prioritizes transcript and composer', async () => {
  const { lastFrame, unmount } = await renderTui(
    <EngineerChat
      {...baseProps}
      maxHeight={24}
      pythonCode={'import numpy as np\nprint("hi")\n2+2'}
    />,
  );

  const frame = stripAnsi(lastFrame() ?? '');
  expect(frame).toContain('Status · Idle');
  expect(frame).toContain('Ask the engineer about pace');
  expect(frame).not.toContain('Python');
  unmount();
});
```

- [ ] **Step 2: Run the engineer chat tests to verify RED**

Run: `npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/EngineerWorkspaceToggle.test.tsx`

Expected: FAIL because details are always initialized as expanded.

- [ ] **Step 3: Initialize details from the compact breakpoint**

Use the existing `compact = rows < 32` breakpoint to start details collapsed only on short terminals, while keeping them open by default on normal-height terminals. Preserve `Tab` toggle behavior and the composer draft across toggles.

- [ ] **Step 4: Run the focused tests to verify GREEN**

Run: `npm test -- src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/EngineerWorkspaceToggle.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/tui/screens/EngineerChat.tsx src/tui/screens/EngineerChat.test.tsx src/tui/screens/engineer/EngineerWorkspaceToggle.test.tsx
git commit -m "ux: keep engineer details compact-safe"
```

### Task 3: Calm Status And Scroll Chrome Without Hiding State

**Files:**
- Modify: `src/tui/screens/engineer/EngineerDetails.tsx`
- Modify: `src/tui/screens/engineer/EngineerDetails.test.tsx`
- Modify: `src/tui/screens/engineer/transcript-rows.ts`
- Modify: `src/tui/screens/engineer/transcript-rows.test.ts`
- Modify: `src/vendor/components/FullscreenLayout.tsx`
- Modify: `src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`

- [ ] **Step 1: Write failing tests for calmer status and scroll chrome**

```tsx
it('marks non-error activity as muted status text while preserving error emphasis', async () => {
  const { lastFrame, unmount } = await renderTui(
    <EngineerDetails
      activity={['Thinking', 'Error: tool failed']}
      pythonCode=""
      isExpanded
    />,
  );

  const frame = lastFrame() ?? '';
  expect(frame).toContain('\u001b[90mThinking');
  expect(frame).toContain('\u001b[31m> Error: tool failed');
  unmount();
});
```

```ts
it('renders pending assistant status as a quiet ellipsis row instead of a spinner-heavy block', () => {
  const rows = buildTranscriptRows({
    messages: [],
    streamingText: '',
    isStreaming: true,
    status: 'Thinking',
    messageWidth: 24,
  });

  expect(rows.some((row) => row.kind === 'pending-status')).toBe(true);
  expect(rows.some((row) => row.plainText === '  ... Thinking')).toBe(true);
});
```

- [ ] **Step 2: Run the focused status/scroll tests to verify RED**

Run: `npm test -- src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`

Expected: FAIL because non-error activity currently uses stronger semantic colors and the pending transcript row still renders an animated spinner plus unindented status text.

- [ ] **Step 3: Implement quieter status presentation and a subtle scroll divider**

Keep only true errors in red, render non-error recent activity in muted text, and replace the pending spinner row with a stable muted ellipsis line under the `Engineer` label. In the shell chrome, add a one-line subtle separator above the bottom region when the jump pill or sticky prompt is present so transcript content and bottom chrome do not visually merge.

- [ ] **Step 4: Run the focused status/scroll tests to verify GREEN**

Run: `npm test -- src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/engineer/transcript-rows.test.ts src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx`

Expected: PASS with 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/tui/screens/engineer/EngineerDetails.tsx src/tui/screens/engineer/EngineerDetails.test.tsx src/tui/screens/engineer/transcript-rows.ts src/tui/screens/engineer/transcript-rows.test.ts src/vendor/components/FullscreenLayout.tsx src/tui/screens/engineer/EngineerTranscriptScroll.test.tsx
git commit -m "ux: calm engineer status and scroll chrome"
```

### Task 4: Preview, Verify, And Push

**Files:**
- No code files required unless preview surfaces a regression.

- [ ] **Step 1: Run full verification**

Run:
- `npm run typecheck`
- `npm test`
- `npm run build`

Expected: all commands exit 0 with no unexpected failures.

- [ ] **Step 2: Preview in tmux at normal and short terminal sizes**

Use a tmux session to run `npm run dev`, navigate to the engineer screen, ask at least two questions, page up/down through the transcript, and verify:
- placeholder reads visually as placeholder before typing
- typed draft reads as primary text
- details are open on normal-height terminals and compact-safe on short terminals
- status text is readable but not noisy
- transcript and bottom chrome are visually separated

- [ ] **Step 3: Fix any preview regressions with a new red-green cycle**

If the preview exposes a framing or color bug, write a failing test first, verify RED, implement the smallest fix, rerun the focused test, then rerun full verification.

- [ ] **Step 4: Push `main`**

```bash
git push origin main
```

Expected: `origin/main` matches local `HEAD` and `git status -sb` is clean.
