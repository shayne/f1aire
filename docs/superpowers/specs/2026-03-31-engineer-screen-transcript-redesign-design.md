# Engineer Screen Transcript And Composer Redesign (Design)

## Context

The current engineer screen in `f1aire` still behaves like a fully owned fixed-layout dashboard. `App` computes a bounded content area and `EngineerChat` manually slices transcript rows into that box while also owning the bottom input state. That creates three related problems:

- Typing and transcript updates travel through the same render path.
- The bottom input is based on `ink-text-input`, so multiline behavior is limited and brittle.
- The transcript is treated like a panel to repaint instead of a primary terminal conversation surface.

Claude Code solves the same class of problem differently. It still owns a fullscreen environment, but it treats the transcript as the main surface, keeps a sticky bottom composer, and localizes prompt re-render churn to the prompt subtree. This redesign adopts that interaction model without copying Claude Code's custom renderer internals.

## Goals

- Make the engineer transcript the primary surface.
- Keep a persistent composer at the bottom of the engineer screen.
- Isolate typing updates from transcript rendering so a typed character does not rebuild the whole engineer screen.
- Support predictable multiline composition with explicit cursor and submit behavior.
- Preserve stable transcript scroll behavior during streaming output and terminal resize.

## Non-Goals

- Rebuild the entire app shell around scrollback-style rendering.
- Port Claude Code's custom Ink implementation or renderer internals.
- Replace the current markdown-to-terminal pipeline in this project-wide change.
- Redesign picker, settings, download, or summary screens in the same project.

## Decision

Adopt a Claude Code-style engineer workspace:

- a transcript-first main surface
- a sticky bottom composer that remains mounted
- lightweight secondary engineer details instead of a permanent heavyweight side pane

The engineer screen will remain inside the current routed app, but it will stop behaving like a dashboard with a manually managed conversation panel plus a separate input panel. The transcript becomes the main vertical workspace. Older content scrolls off the top. The composer stays anchored at the bottom. When the user scrolls up, auto-follow pauses. When the user returns to bottom, live-follow resumes.

## Architecture

The redesign introduces a small set of focused units inside the engineer screen.

### `EngineerWorkspace`

`EngineerWorkspace` is the container rendered by `App` for the engineer route. It receives app-level session, streaming, and summary props, then composes the engineer UI. It does not own draft text, cursor logic, transcript slicing, or internal engineer layout state beyond wiring subcomponents together.

### `TranscriptViewport`

`TranscriptViewport` owns transcript presentation and follow behavior. It receives normalized transcript items and renders a visible window derived from terminal size and composer height. It is responsible for:

- live-follow when the user is at bottom
- paused scroll mode when the user scrolls away
- resize reconciliation while preserving a stable anchor
- jump-to-latest behavior
- unread-or-below indicators while paused

This is the only unit that should care about transcript windowing and scroll state.

### `Composer`

`Composer` is a persistent bottom editor with local draft state. It owns:

- draft text
- cursor offset
- multiline wrapping
- visible line count
- submit vs newline behavior
- paste behavior

The composer remains mounted even while the transcript updates. Keystrokes re-render the composer subtree, not the transcript subtree.

### `EngineerDetails`

`EngineerDetails` surfaces status, activity, session metadata, and Python preview in a compact way. The redesign removes the permanent dashboard-style right pane as a primary layout requirement. Instead, engineer details become supporting chrome:

- a compact always-visible status strip or short summary near the composer
- an optional expanded panel when deeper inspection is needed

This keeps the transcript visually primary.

### Supporting Hooks

Two dedicated hooks define the internal UI state model:

- `useComposerState`: manages draft text, cursor position, submit/newline rules, visible composer height, and draft reset on send
- `useTranscriptViewport`: manages follow mode, paused offset or anchor, resize reconciliation, and jump-to-latest behavior

## Interaction Model

The engineer screen behaves like a conversation workspace instead of a static dashboard.

- The transcript occupies the main vertical region.
- The composer is always visible at the bottom.
- New agent output keeps the transcript pinned to bottom while live-follow is active.
- Scrolling upward pauses follow mode and keeps the visible anchor stable through streaming updates.
- Returning to bottom resumes live-follow and clears any "more below" state.
- The transcript should be able to move older content off the top naturally rather than forcing the whole screen to feel like a fixed frame.

The composer should feel like a terminal prompt rather than a boxed secondary panel competing with the transcript.

## Input Behavior

The current direct `ink-text-input` usage is not sufficient for the target behavior. The composer will instead use a controlled input model inspired by Claude Code's prompt stack.

Required behavior:

- `Enter` submits by default.
- `Shift+Enter` inserts a newline.
- `Meta+Enter` and `Alt+Enter` are out of scope for the initial pass.
- The composer grows from one visible line up to a fixed cap.
- Visible cap: 5 lines.
- Once the cap is reached, the composer scrolls internally instead of continuing to grow.
- Cursor position is explicit state, so multiline cursor movement remains stable.
- Multi-line paste is accepted without accidental submit.
- Submit clears the local draft immediately inside the composer subtree.
- Submitting again while a request is active is blocked in the initial pass, but local typing remains enabled.

## Data Flow

The redesign separates three update streams that are currently coupled.

### Agent Stream To Transcript Model

Incoming user, assistant, tool, and status events are normalized into append-only transcript items. `TranscriptViewport` consumes only this normalized model plus viewport constraints.

### User Typing To Composer Draft

Draft text, cursor offset, and composer height remain local to `Composer` until submit. Clearing the draft after submit is a local composer action and must not depend on transcript derivation or app-wide rerender timing.

### Terminal Resize To Viewport Reconciliation

Width and height changes trigger transcript reflow and viewport reconciliation. They may also recompute composer wrap and visible height. Resize handling must preserve paused scroll anchors and avoid corrupting the visible transcript window.

## Rendering And Performance Boundaries

The main architectural requirement is render isolation, not micro-optimization.

- Typing in the composer must not rebuild transcript rows.
- Transcript row derivation should be memoized by transcript content and render width, not by draft text.
- Transcript follow and pause state should live with the viewport, not in `App`.
- App-level transport state remains in `App`, but engineer-local UI state remains inside the engineer screen.

This redesign does not require measuring precise render counts in production. The requirement is structural: composer updates stay inside composer boundaries, transcript updates stay inside transcript boundaries, and only shared layout changes cross those boundaries.

## Markdown And Rendering Strategy

The current markdown-to-terminal pipeline should remain in place for this redesign. The existing `marked` plus `marked-terminal` approach was chosen to keep terminal line counts deterministic, and that constraint still matters while transcript windowing remains width-sensitive.

Therefore:

- keep the current terminal markdown rendering helper for the redesign
- improve transcript ownership and viewport logic first
- defer any richer markdown renderer or component-level markdown pass until after the new viewport model is stable

## Error Handling

The engineer screen should degrade safely rather than breaking the whole workspace.

- If a transcript item fails to normalize or render, show a safe fallback row.
- If a resize produces temporarily invalid dimensions, clamp to a minimal usable layout and recover on the next render.
- If an unsupported key sequence is received, ignore it rather than mutating the draft incorrectly.
- If streaming is active, keep typing enabled unless there is an explicit reason to lock the composer.

## Testing

Testing should follow the new boundaries instead of relying only on one screen-level integration test.

### `useComposerState`

Cover:

- submit vs newline behavior
- cursor movement across wrapped multiline input
- visible height growth up to the configured cap
- internal composer scrolling after the cap
- paste handling
- draft clearing after submit

### `useTranscriptViewport`

Cover:

- live-follow at bottom
- paused scroll when the user moves away from bottom
- stable reconciliation during transcript append
- stable reconciliation during resize
- jump-to-latest behavior
- below/unread hint state

### Component Tests

Cover:

- `Composer` rendering at one line and multi-line states
- capped composer height behavior
- `TranscriptViewport` rendering for different widths and transcript lengths
- compact details rendering and optional expanded details state

### Integration Test

Cover one focused end-to-end engineer-screen scenario:

- type into the composer
- verify the composer draft updates without transcript corruption
- submit
- verify local draft clears immediately
- append streaming output
- verify live-follow behavior when at bottom
- scroll up
- verify paused mode and jump-to-latest recovery

## Implementation Notes

- This redesign should be implemented only for the engineer screen in the initial pass.
- Existing app routing can stay in place.
- The implementation may keep the current `EngineerChat` file as a migration shell initially, but the target architecture should end with smaller focused files for viewport, composer, and engineer details behavior.
- The new design should remain compatible with existing summary, activity, and Python preview data already produced by `App`.

## Open Decision Already Resolved

This design intentionally chooses the Claude Code-style interaction model over a terminal scrollback-first redesign. The app will still own the fullscreen engineer screen, but the internal behavior will feel closer to a transcript surface with a sticky composer than to a boxed dashboard.
