# TUI UX Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Ink UI/UX by adding better transcript scroll-follow behavior, terminal-native polish, and small reusable shell helpers inspired by `claude-code`.

**Architecture:** Keep `f1aire` on stock Ink, but borrow the interaction model rather than Claude Code's custom renderer. Add small focused helpers for terminal title and hyperlinks, then update `EngineerChat` to preserve scroll position while paused and surface catch-up affordances.

**Tech Stack:** React 18, Ink 5, ink-testing-library, Vitest, TypeScript.

---

### Task 1: Terminal Shell Helpers

**Files:**

- Create: `src/tui/terminal-chrome.ts`
- Test: `src/tui/terminal-chrome.test.ts`
- Modify: `src/app.tsx`
- Modify: `src/tui/screens/ApiKeyPrompt.tsx`
- Modify: `src/tui/screens/Summary.tsx`

- [ ] Add failing tests for terminal title composition and OSC 8 hyperlink fallback.
- [ ] Implement a small terminal helper module for title strings and file-path hyperlinks.
- [ ] Wire the title helper into `App` and render linked paths in screens that expose local files.
- [ ] Re-run the focused terminal helper tests.

### Task 2: Engineer Transcript Scroll UX

**Files:**

- Modify: `src/tui/screens/EngineerChat.tsx`
- Test: `src/tui/screens/EngineerChat.test.tsx`

- [ ] Add failing tests for preserving scroll position while new transcript content arrives.
- [ ] Add failing tests for showing a catch-up hint when the user is scrolled away from the live tail.
- [ ] Implement minimal scroll bookkeeping so `EngineerChat` auto-follows only when pinned to bottom.
- [ ] Implement the catch-up status copy and update chat footer hints to match.
- [ ] Re-run the focused `EngineerChat` tests.

### Task 3: Verification

**Files:**

- Modify: `src/tui/components/FooterHints.tsx`
- Test: `src/tui/components/FooterHints.test.tsx`

- [ ] Update footer hints to document the new transcript behavior.
- [ ] Run the targeted TUI tests.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
