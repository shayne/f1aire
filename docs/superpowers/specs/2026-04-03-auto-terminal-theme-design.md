# Auto Terminal Theme Design

## Goal

Make `f1aire` theme itself automatically from the terminal's actual background color, with no user-facing theme picker or settings toggle, and add a first-class light palette that preserves the current semantic theme API.

## Current State

`f1aire` already routes all screen colors through `ThemeProvider` and `useTheme()`, but the provider always serves `darkTheme` unless a caller manually injects a custom `value`. The semantic token boundary is correct, but there is no runtime theme resolution and no light palette.

The current dark palette is defined in `src/tui/theme/tokens.ts`, the provider in `src/tui/theme/provider.tsx`, and the root mount in `src/app.tsx`.

## Design

### Theme Model

The app will keep a single semantic theme API and remove theme choice as a product concept for now. Components continue to call `useTheme()` and receive a concrete `F1aireTheme`; they do not branch on `auto`, `dark`, or `light`.

`ThemeProvider` becomes the only place that resolves terminal appearance. It will expose whichever concrete palette matches the terminal background, defaulting to dark when detection is unavailable.

### Terminal Background Detection

Detection should follow the terminal's background color, not the OS appearance setting. That matches the desired behavior for a dark terminal on a light-mode OS.

The implementation should use a two-stage resolver:

1. A synchronous initial seed from `$COLORFGBG`, when present.
2. An OSC 11 terminal background query path for a more accurate value after startup, when the terminal and the copied Ink runtime expose a usable stdin query channel.

If neither source is available or parsing fails, resolve to the dark palette.

The detector should parse both `rgb:R/G/B`-style OSC responses and `#RRGGBB` / `#RRRRGGGGBBBB` responses, compute relative luminance, and classify `> 0.5` as light.

### Light Palette

Add a new `lightTheme` to `src/tui/theme/tokens.ts` and widen `F1aireTheme.name` to `'dark' | 'light'`.

The light palette should borrow the structure and restraint of Claude Code's light theme, but be tuned for `f1aire`:

- Dark body text on a light terminal background.
- Brand orange for `f1aire` identity and assistant labels.
- Blue/cyan as the interaction accent for user labels, active menu rows, composer caret, and tool status.
- Muted neutral grays for metadata, placeholder text, hints, and passive chrome.
- Green for success and amber/red for true state changes only.
- Shimmer variants should remain lighter/brighter than their base status colors and still read on light backgrounds.

No component should assume a specific theme name for behavior. The palette itself carries the visual differences.

### Root Wiring

`src/app.tsx` should continue to mount a single `ThemeProvider` at the root, but without supplying a manual theme value. The provider itself chooses the active palette.

The legacy `theme` singleton exported from `src/tui/theme.ts` should continue mapping to the dark palette for compatibility with older non-hook call sites and tests that import the singleton directly.

## Testing

Use test-first implementation for each behavior change.

Coverage should include:

- `$COLORFGBG` dark/light seed parsing.
- OSC 11 response parsing and luminance classification.
- `ThemeProvider` renders the dark or light palette based on a resolved detector result.
- Detection fallback stays dark when no signal is available.
- Existing screens still consume semantic tokens through `useTheme()` without direct theme-name branching.
- The light palette produces intentional values for the core token groups: brand text, transcript labels, chrome accents, composer placeholder/caret, and status/shimmer colors.

Manual verification should launch the TUI in tmux and inspect:

- A dark-background terminal renders the dark palette.
- A light-background terminal renders the light palette.
- Launch, picker, downloading, summary, and engineer screens remain legible.
- The composer placeholder, transcript labels, and status shimmer are readable in both themes.

## Risks And Constraints

Terminal theme auto-detection is best-effort. `$COLORFGBG` is not universally set, and OSC 11 support varies by emulator and multiplexers. The fallback must be deterministic and conservative.

The copied Ink runtime may not currently expose a public query hook equivalent to the one used by the upstream app's theme watcher. If that is missing, the first implementation can still ship `$COLORFGBG`-seeded auto theme plus a parser/resolver abstraction, then add the live OSC watcher in a follow-up without changing the component API.

Avoid adding a user-facing theme switcher, persisted theme setting, or per-screen theme branching in this pass.
