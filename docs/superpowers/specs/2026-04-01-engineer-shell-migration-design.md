# Engineer Shell Migration (Design)

## Context

The current engineer screen in `f1aire` still behaves like a fixed, app-managed dashboard. `App` reserves a persistent global header and footer, then `EngineerChat` manually computes the remaining transcript height and slices rows inside that bounded area. The result works, but it still feels like a custom managed TUI frame rather than a transcript-first agent workspace.

The target interaction model is a fullscreen managed shell built around a real scroll primitive, a dominant transcript surface, and a pinned bottom composer. We want to adopt that model by copying the upstream custom Ink runtime and shell primitives into `f1aire`, then making the engineer screen the first consumer.

## Goals

- Restructure the `engineer` screen around a transcript-first fullscreen shell.
- Copy the upstream custom Ink runtime and shell primitives into this repo so `f1aire` owns them locally.
- Remove the global app header and footer from the engineer path.
- Render the engineer screen through a shell with:
  - lightweight top chrome
  - a dominant scrollable transcript surface
  - a pinned bottom composer
- Keep `App` as the owner of navigation, runtime boot, streaming state, and engineer session state.
- Make the engineer shell scalable for future UI growth without continuing to extend the current hand-managed layout.

## Non-Goals

- Migrate non-engineer screens in the same project.
- Rebuild `f1aire` around a terminal scrollback-only model.
- Rework the domain ownership of session loading, summary generation, or streaming transport.
- Copy the entire upstream application layer into `f1aire`.

## Decision

Adopt a copied custom Ink runtime inside `f1aire`, then migrate only the engineer screen onto a copied fullscreen shell structure in the first pass.

This is intentionally not an adapter layer on top of stock Ink. The key shell primitives we want, especially the scroll container, depend on the upstream renderer internals. If we want those primitives honestly, we need the renderer subtree as well. The engineer screen becomes the first migrated screen, while the rest of the app can remain on the current rendering path until a later migration.

## Architecture

### Copied Runtime Boundary

Copy the upstream custom Ink runtime into a clearly isolated local subtree, likely `src/vendor/claude-ink/` or equivalent. Preserve the copied file structure as much as practical so future local changes remain easy to compare against the source we copied from.

The copied boundary should include:

- the renderer/runtime subtree
- the component primitives needed by the engineer shell
- the fullscreen shell component and its directly required helpers

The copied boundary should not include unrelated application features such as suggestions, permissions UI, or product-specific overlays unless a copied shell file requires them and they cannot be reasonably removed in the first pass.

### Renderer Ownership

Once copied into `f1aire`, this renderer subtree is ours. We are free to modify it for `f1aire`'s needs. That ownership model is intentional. The point of this migration is not to depend on upstream packaging or to partially imitate behavior. The point is to make the shell primitives a first-class part of this codebase.

### App Boundary

`App` remains the owner of:

- navigation and routed screen selection
- runtime/bootstrap state
- OpenAI key flow
- engineer session creation
- streaming output and status
- summary, activity, and Python preview data

The migration changes how the engineer screen is rendered, not who owns the business logic.

### Engineer Boundary

The engineer route becomes a dedicated fullscreen shell composed from the copied runtime primitives.

The engineer shell will have three roles:

- top chrome: a compact, always-visible one-line session/status strip inside the engineer screen
- scrollable main surface: the transcript
- bottom chrome: a pinned composer

Expanded details stop being a permanently reserved dashboard region. They become lightweight in-shell supporting chrome, either collapsible or overlay-style, so the transcript remains visually primary.

## Shell Structure

### Global App Behavior

When `screen.name !== 'engineer'`, the app keeps the current rendering path.

When `screen.name === 'engineer'`, `App` should no longer render the current global `Header` and `FooterHints`. The engineer screen becomes responsible for its own shell chrome. This is necessary to avoid the current “managed frame with an internal transcript panel” feeling.

### Engineer Shell Layout

The engineer shell should mirror the fullscreen structure we are copying:

- a shell root that fills the terminal
- a scrollable transcript container occupying most of the vertical space
- a pinned bottom composer region
- optional floating or lightweight shell affordances such as a jump-to-latest pill or compact sticky session strip

The transcript should start at the top of the engineer surface rather than below a persistent app header.

### Compact Top Chrome

The engineer shell keeps a compact one-line status strip because `f1aire` needs session identity and live timing context visible without forcing the user to open details.

This top chrome should include:

- season / meeting / session identity
- compact live status or “as of” state
- potentially the most recent activity or mode indicator if it fits

It should remain visually lightweight and subordinate to the transcript.

### Composer Placement

The composer stays pinned at the bottom of the engineer shell. It remains mounted while transcript content grows or scrolls. Composer behavior itself should remain conceptually separate from the shell so we can continue using our engineer-specific draft semantics on top of the copied runtime.

## Data Flow

### Transport To Transcript

`App` continues producing the message, streaming, status, activity, summary, and Python preview props. The engineer shell consumes those props and turns them into transcript content plus compact shell chrome.

### Transcript To Scroll Shell

The transcript becomes the `scrollable` content of the fullscreen shell. Scrolling behavior belongs to the copied shell primitive, not to our current hand-managed height math.

We may still retain transcript normalization logic on the `f1aire` side, but the layout and scrolling behavior should be owned by the copied shell structure wherever possible.

### Composer To Bottom Chrome

The composer remains a local engineer concern. The shell only pins it and gives it bottom ownership. Draft state, submit behavior, and multiline behavior remain within `f1aire`'s engineer layer.

## Migration Boundaries

The first migration should remain narrow:

- copy the runtime and shell primitives into `f1aire`
- make the engineer screen render through that shell
- do not migrate season, meeting, session, settings, api-key, downloading, or summary screens in the same pass

This keeps the first use of the copied runtime focused on the agent workspace while avoiding an all-at-once application migration.

## Testing

Testing should cover both the copied runtime integration and the engineer behavior layered on top.

### Runtime / Shell Smoke Tests

Cover:

- copied renderer boots in this repo
- fullscreen shell can render an engineer transcript surface
- pinned bottom region remains present while the scrollable area changes
- shell scroll behavior can pause, follow, and recover

### Engineer Shell Tests

Cover:

- no global app header/footer on the engineer route
- compact in-shell status strip renders instead
- transcript is the dominant vertical surface
- composer stays pinned at bottom
- transcript follow/pause behavior still works with new messages
- width and height changes do not create false “new updates” signals

### Regression Coverage

Preserve or adapt the current engineer regressions for:

- multiline composer behavior
- paused transcript behavior
- streamed text updates while paused
- pending status changes while paused

The copied shell should replace our layout plumbing, not regress the engineer interaction model we already fixed.

## Risks

### Runtime Import Volume

Copying the renderer subtree is a large change. The risk is not just lines of code, but the possibility of dragging in product-specific shell dependencies unnecessarily. The migration must keep the copied boundary narrow and explicit.

### Mixed Rendering Paths

For a period, `f1aire` will have the engineer screen rendered through the copied runtime model while the rest of the app still uses the current rendering path. That is acceptable for the first pass, but the boundary must be kept obvious so future migrations are deliberate.

### Over-Copying

The easiest failure mode is importing too much upstream application code just to make the shell compile. The first pass should aggressively remove or stub only what is needed to get the shell running for the engineer screen.

## Commit Message Policy

Commits for this work should describe `f1aire` goals and behavior, not the name of the upstream source we copied from. Commit messages should be phrased in terms such as:

- `feat: add engineer fullscreen shell runtime`
- `refactor: move engineer screen onto fullscreen shell`
- `fix: preserve transcript follow state in engineer shell`

This keeps the repository history centered on `f1aire`’s architecture and user-facing goals.

## Open Decisions Already Resolved

- Scope is engineer screen only for the first migration.
- The shell should keep a compact one-line status strip rather than removing all metadata chrome.
- The runtime should be copied into this repo rather than consumed as an external dependency or reimplemented as an adapter.
