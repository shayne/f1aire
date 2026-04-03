# Auto Terminal Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `f1aire` automatically select a dark or light semantic palette from the terminal's actual background color, with no user-facing theme switcher.

**Architecture:** Keep the existing semantic theme boundary intact and move all automatic theme resolution into `ThemeProvider`. Add a standalone detector module that can synchronously seed from `$COLORFGBG`, parse OSC 11 background-color responses, and optionally refresh through the vendored Ink terminal querier.

**Tech Stack:** TypeScript, React, vendored Ink terminal querier, Vitest, `ink-testing-library`, tmux preview.

---

## File Structure

- Modify `src/tui/theme/tokens.ts`: add `lightTheme`, widen `F1aireTheme.name`, and define light-mode semantic token values.
- Modify `src/tui/theme/provider.tsx`: resolve the current palette automatically from the terminal background and keep exposing only a concrete `F1aireTheme`.
- Create `src/tui/theme/system-theme.ts`: parse `$COLORFGBG`, parse OSC 11 color responses, classify luminance, and resolve dark/light theme names.
- Create `src/tui/theme/system-theme-watcher.ts`: query OSC 11 through the vendored Ink `internal_querier` and update the provider when the terminal reports a background color.
- Modify `src/tui/theme.ts`: export `lightTheme` and the new detector/provider pieces while preserving the legacy dark singleton.
- Modify `src/tui/theme/provider.test.tsx`: cover provider auto-resolution and fallback behavior.
- Create `src/tui/theme/system-theme.test.ts`: cover `$COLORFGBG` parsing, OSC parsing, and luminance classification.
- Create `src/tui/theme/system-theme-watcher.test.ts`: cover OSC 11 refresh and unsupported-terminal fallback.

---

### Task 1: Add Terminal Theme Detection Primitives

**Files:**
- Create: `src/tui/theme/system-theme.ts`
- Test: `src/tui/theme/system-theme.test.ts`

- [ ] **Step 1: Write failing tests for `$COLORFGBG` and OSC parsing**

Create `src/tui/theme/system-theme.test.ts` with these behaviors:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  getSystemThemeName,
  parseColorfgbgTheme,
  resetCachedSystemThemeForTests,
  resolveAutoThemeName,
  setCachedSystemTheme,
  themeFromOscColor,
} from './system-theme.js';

describe('system-theme', () => {
  const originalColorfgbg = process.env.COLORFGBG;

  afterEach(() => {
    if (originalColorfgbg === undefined) {
      delete process.env.COLORFGBG;
    } else {
      process.env.COLORFGBG = originalColorfgbg;
    }
    resetCachedSystemThemeForTests();
  });

  it('parses dark and light hints from $COLORFGBG', () => {
    expect(parseColorfgbgTheme('15;0')).toBe('dark');
    expect(parseColorfgbgTheme('0;15')).toBe('light');
    expect(parseColorfgbgTheme('0;2;7')).toBe('light');
    expect(parseColorfgbgTheme('')).toBeUndefined();
    expect(parseColorfgbgTheme('0;not-a-number')).toBeUndefined();
  });

  it('seeds the cached system theme from $COLORFGBG and falls back to dark', () => {
    process.env.COLORFGBG = '0;15';
    expect(getSystemThemeName()).toBe('light');

    resetCachedSystemThemeForTests();
    delete process.env.COLORFGBG;
    expect(getSystemThemeName()).toBe('dark');
  });

  it('classifies OSC 11 color responses by luminance', () => {
    expect(themeFromOscColor('rgb:0000/0000/0000')).toBe('dark');
    expect(themeFromOscColor('rgb:ffff/ffff/ffff')).toBe('light');
    expect(themeFromOscColor('#ffffff')).toBe('light');
    expect(themeFromOscColor('#000000')).toBe('dark');
    expect(themeFromOscColor('not-a-color')).toBeUndefined();
  });

  it('resolves auto theme names from the cached system theme only', () => {
    setCachedSystemTheme('light');

    expect(resolveAutoThemeName()).toBe('light');
  });
});
```

- [ ] **Step 2: Run the new test file and verify it fails for missing exports**

Run:

```bash
npm test -- src/tui/theme/system-theme.test.ts
```

Expected: FAIL because `src/tui/theme/system-theme.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal detector module**

Create `src/tui/theme/system-theme.ts`:

```ts
export type SystemThemeName = 'dark' | 'light';

let cachedSystemTheme: SystemThemeName | undefined;

export function getSystemThemeName(): SystemThemeName {
  if (cachedSystemTheme === undefined) {
    cachedSystemTheme =
      parseColorfgbgTheme(process.env.COLORFGBG) ?? 'dark';
  }

  return cachedSystemTheme;
}

export function setCachedSystemTheme(themeName: SystemThemeName): void {
  cachedSystemTheme = themeName;
}

export function resolveAutoThemeName(): SystemThemeName {
  return getSystemThemeName();
}

export function resetCachedSystemThemeForTests(): void {
  cachedSystemTheme = undefined;
}

export function parseColorfgbgTheme(
  colorfgbg: string | undefined,
): SystemThemeName | undefined {
  if (!colorfgbg) return undefined;

  const parts = colorfgbg.split(';');
  const bg = parts[parts.length - 1];
  if (bg === undefined || bg === '') return undefined;

  const bgNum = Number(bg);
  if (!Number.isInteger(bgNum) || bgNum < 0 || bgNum > 15) {
    return undefined;
  }

  return bgNum <= 6 || bgNum === 8 ? 'dark' : 'light';
}

export function themeFromOscColor(
  data: string,
): SystemThemeName | undefined {
  const rgb = parseOscRgb(data);
  if (!rgb) return undefined;

  const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  return luminance > 0.5 ? 'light' : 'dark';
}

type Rgb = { r: number; g: number; b: number };

function parseOscRgb(data: string): Rgb | undefined {
  const rgbMatch =
    /^rgba?:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(
      data,
    );
  if (rgbMatch) {
    return {
      r: hexComponent(rgbMatch[1]!),
      g: hexComponent(rgbMatch[2]!),
      b: hexComponent(rgbMatch[3]!),
    };
  }

  const hashMatch = /^#([0-9a-f]+)$/i.exec(data);
  if (hashMatch && hashMatch[1]!.length % 3 === 0) {
    const hex = hashMatch[1]!;
    const width = hex.length / 3;
    return {
      r: hexComponent(hex.slice(0, width)),
      g: hexComponent(hex.slice(width, 2 * width)),
      b: hexComponent(hex.slice(2 * width)),
    };
  }

  return undefined;
}

function hexComponent(hex: string): number {
  return parseInt(hex, 16) / (16 ** hex.length - 1);
}
```

- [ ] **Step 4: Re-run the detector tests and verify they pass**

Run:

```bash
npm test -- src/tui/theme/system-theme.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/theme/system-theme.ts src/tui/theme/system-theme.test.ts
git commit -m "feat: add terminal theme detection primitives"
```

---

### Task 2: Add The Light Semantic Palette

**Files:**
- Modify: `src/tui/theme/tokens.ts`
- Modify: `src/tui/theme.ts`
- Test: `src/tui/theme/provider.test.tsx`

- [ ] **Step 1: Write failing tests that assert both dark and light semantic token sets exist**

Extend `src/tui/theme/provider.test.tsx` with a test that imports `lightTheme` and validates the key palette differences:

```ts
it('defines a light palette with dark body text and the same semantic token shape', () => {
  expect(lightTheme.name).toBe('light');
  expect(lightTheme.text.primary).toBe('rgb(0,0,0)');
  expect(lightTheme.text.brand).toBe('rgb(215,119,87)');
  expect(lightTheme.transcript.user).toBe('rgb(37,99,235)');
  expect(lightTheme.transcript.assistant).toBe('rgb(215,119,87)');
  expect(lightTheme.composer.placeholder).toBe('rgb(102,102,102)');
  expect(lightTheme.status.thinkingShimmer).toBe('rgb(245,149,117)');
});
```

Import `lightTheme` from `../theme.js` in the test file.

- [ ] **Step 2: Run the theme provider tests and verify they fail because `lightTheme` is missing**

Run:

```bash
npm test -- src/tui/theme/provider.test.tsx
```

Expected: FAIL on the new `lightTheme` assertions/import.

- [ ] **Step 3: Add the light palette and widen the theme name type**

Modify `src/tui/theme/tokens.ts` so `name` supports `'dark' | 'light'`, keep `darkTheme` unchanged except for type widening, and add `lightTheme`:

```ts
export type F1aireTheme = {
  name: 'dark' | 'light';
  // existing token groups stay unchanged
};

export const lightTheme: F1aireTheme = {
  name: 'light',
  text: {
    primary: 'rgb(0,0,0)',
    secondary: 'rgb(0,0,0)',
    muted: 'rgb(102,102,102)',
    brand: 'rgb(215,119,87)',
  },
  chrome: {
    border: 'rgb(153,153,153)',
    panelTitle: 'rgb(0,0,0)',
    selected: 'rgb(37,99,235)',
    subtle: 'rgb(175,175,175)',
  },
  transcript: {
    user: 'rgb(37,99,235)',
    assistant: 'rgb(215,119,87)',
    auxiliary: 'rgb(102,102,102)',
  },
  composer: {
    caret: 'rgb(37,99,235)',
    activeMarker: 'rgb(37,99,235)',
    inactiveMarker: 'rgb(102,102,102)',
    placeholder: 'rgb(102,102,102)',
  },
  status: {
    thinking: 'rgb(215,119,87)',
    thinkingShimmer: 'rgb(245,149,117)',
    tool: 'rgb(37,99,235)',
    toolShimmer: 'rgb(137,155,255)',
    error: 'rgb(171,43,63)',
    errorShimmer: 'rgb(220,88,105)',
    ok: 'rgb(44,122,57)',
    idle: 'rgb(102,102,102)',
  },
};
```

Export `lightTheme` from `src/tui/theme.ts` while keeping the legacy `theme` singleton mapped to `darkTheme`.

- [ ] **Step 4: Re-run the theme provider tests and verify they pass**

Run:

```bash
npm test -- src/tui/theme/provider.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/theme/tokens.ts src/tui/theme.ts src/tui/theme/provider.test.tsx
git commit -m "ux: add automatic light semantic theme"
```

---

### Task 3: Auto-Resolve ThemeProvider From Terminal Background

**Files:**
- Modify: `src/tui/theme/provider.tsx`
- Create: `src/tui/theme/system-theme-watcher.ts`
- Modify: `src/tui/theme/provider.test.tsx`
- Create: `src/tui/theme/system-theme-watcher.test.ts`

- [ ] **Step 1: Write failing provider and watcher tests for auto-resolution and OSC refresh**

Extend `src/tui/theme/provider.test.tsx` with these behaviors:

```ts
import {
  resetCachedSystemThemeForTests,
  setCachedSystemTheme,
} from './system-theme.js';

afterEach(() => {
  resetCachedSystemThemeForTests();
});

it('resolves the default provider theme from the cached system theme', () => {
  setCachedSystemTheme('light');

  const { lastFrame } = render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );

  expect(lastFrame()).toBe('light:rgb(215,119,87)');
});
```

Create `src/tui/theme/system-theme-watcher.test.ts` with a fake querier:

```ts
import { describe, expect, it, vi } from 'vitest';
import { oscColor } from '../../vendor/ink/terminal-querier.js';
import { watchSystemTheme } from './system-theme-watcher.js';
import {
  getSystemThemeName,
  resetCachedSystemThemeForTests,
  setCachedSystemTheme,
} from './system-theme.js';

describe('watchSystemTheme', () => {
  it('queries OSC 11, updates provider state, and refreshes the cached system theme', async () => {
    resetCachedSystemThemeForTests();
    setCachedSystemTheme('dark');

    const setSystemTheme = vi.fn();
    const querier = {
      send: vi
        .fn()
        .mockResolvedValue({ type: 'osc', code: 11, data: 'rgb:ffff/ffff/ffff' }),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = watchSystemTheme(querier, setSystemTheme);
    await Promise.resolve();

    expect(querier.send).toHaveBeenCalledWith(oscColor(11));
    expect(querier.flush).toHaveBeenCalled();
    expect(setSystemTheme).toHaveBeenCalledWith('light');
    expect(getSystemThemeName()).toBe('light');

    cleanup();
  });

  it('keeps the current cached theme when OSC 11 is unsupported', async () => {
    resetCachedSystemThemeForTests();
    setCachedSystemTheme('dark');

    const setSystemTheme = vi.fn();
    const querier = {
      send: vi.fn().mockResolvedValue(undefined),
      flush: vi.fn().mockResolvedValue(undefined),
    };

    const cleanup = watchSystemTheme(querier, setSystemTheme);
    await Promise.resolve();

    expect(setSystemTheme).not.toHaveBeenCalled();
    expect(getSystemThemeName()).toBe('dark');

    cleanup();
  });
});
```

- [ ] **Step 2: Run the provider and watcher tests and verify they fail**

Run:

```bash
npm test -- src/tui/theme/provider.test.tsx src/tui/theme/system-theme-watcher.test.ts
```

Expected: FAIL because the provider still defaults to a static dark value and the watcher module does not exist.

- [ ] **Step 3: Implement an auto-resolving provider with an OSC 11 watcher**

Modify `src/tui/theme/provider.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState } from 'react';
import useStdin from '../../vendor/ink/hooks/use-stdin.js';
import {
  getSystemThemeName,
  type SystemThemeName,
} from './system-theme.js';
import { watchSystemTheme } from './system-theme-watcher.js';
import { darkTheme, lightTheme, type F1aireTheme } from './tokens.js';

function themeForSystemTheme(themeName: SystemThemeName): F1aireTheme {
  return themeName === 'light' ? lightTheme : darkTheme;
}

const ThemeContext = createContext<F1aireTheme>(darkTheme);

export function ThemeProvider({
  value,
  children,
}: {
  value?: F1aireTheme;
  children: React.ReactNode;
}): React.JSX.Element {
  const { internal_querier } = useStdin();
  const [systemTheme, setSystemTheme] = useState<SystemThemeName>(() =>
    value ? value.name : getSystemThemeName(),
  );

  useEffect(() => {
    if (value || !internal_querier) return;

    return watchSystemTheme(internal_querier, setSystemTheme);
  }, [internal_querier, value]);

  return (
    <ThemeContext.Provider value={value ?? themeForSystemTheme(systemTheme)}>
      {children}
    </ThemeContext.Provider>
  );
}
```

Create `src/tui/theme/system-theme-watcher.ts`:

```ts
import { oscColor, type TerminalQuerier } from '../../vendor/ink/terminal-querier.js';
import {
  setCachedSystemTheme,
  themeFromOscColor,
  type SystemThemeName,
} from './system-theme.js';

const POLL_INTERVAL_MS = 2000;

export function watchSystemTheme(
  querier: Pick<TerminalQuerier, 'send' | 'flush'>,
  setSystemTheme: (themeName: SystemThemeName) => void,
): () => void {
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  async function poll(): Promise<void> {
    const response = await querier.send(oscColor(11));
    await querier.flush();

    if (disposed) return;

    const nextTheme =
      response && response.type === 'osc'
        ? themeFromOscColor(response.data)
        : undefined;

    if (nextTheme) {
      setCachedSystemTheme(nextTheme);
      setSystemTheme(nextTheme);
    }

    timeout = setTimeout(() => {
      void poll();
    }, POLL_INTERVAL_MS);
  }

  void poll();

  return () => {
    disposed = true;
    if (timeout) clearTimeout(timeout);
  };
}
```

If the always-on polling loop proves noisy in tests, inject a smaller test seam or stop rescheduling when the theme does not change, but keep the production API stable.

- [ ] **Step 4: Re-run the provider and watcher tests and verify they pass**

Run:

```bash
npm test -- src/tui/theme/provider.test.tsx src/tui/theme/system-theme-watcher.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tui/theme/provider.tsx src/tui/theme/system-theme-watcher.ts src/tui/theme/provider.test.tsx src/tui/theme/system-theme-watcher.test.ts
git commit -m "feat: resolve tui theme from terminal background"
```

---

### Task 4: Verify Whole-App Light/Dark Legibility And Commit The Final Polish

**Files:**
- Modify as needed: `src/tui/components/*.tsx`, `src/tui/screens/**/*.tsx`, `src/vendor/components/FullscreenLayout.tsx`
- Test: existing TUI tests touched by any visual-token adjustments

- [ ] **Step 1: Run the full static and unit test suite**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Preview dark-mode behavior in tmux**

Run the app in a tmux session with a dark terminal background and inspect:

- launch screen branding
- season / meeting / session pickers
- downloading progress
- summary screen
- engineer screen transcript, composer placeholder, details drawer, and shimmer row

Expected: current dark-mode visuals remain legible and intentional.

- [ ] **Step 3: Preview light-mode behavior in tmux**

Run the same flow in a light-background terminal, or in a terminal with `$COLORFGBG` set to a light background hint, and inspect the same screens.

Expected: body text, transcript labels, muted metadata, menu selection, composer placeholder/caret, and status/shimmer colors all remain readable on a light background.

- [ ] **Step 4: Make only the minimal token/chrome adjustments required by manual preview**

If preview exposes low-contrast or awkward framing, adjust semantic tokens or isolated chrome usage rather than adding per-screen theme branches. Prefer edits like these:

```ts
// src/tui/theme/tokens.ts
export const lightTheme: F1aireTheme = {
  // adjust semantic values here, not at individual call sites
};
```

- [ ] **Step 5: Re-run all verification commands after any polish edits**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit final polish and report the tmux review outcome**

```bash
git add src/tui src/vendor docs/superpowers/plans/2026-04-03-auto-terminal-theme.md
git commit -m "ux: polish automatic terminal theme legibility"
```

In the completion note, report the exact tmux flow reviewed, whether both dark and light palettes rendered correctly, and any terminal fallback caveats.
