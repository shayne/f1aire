# App UX Refresh (Design)

## Context

`f1aire` now has the right high-level engineer shell structure, but the product still feels visually uneven. The launch and picker screens are functional rather than intentional, shared components rely on heavy borders and saturated accent colors, and some first-render states feel cramped or visually cut off. The engineer route is closer to the desired transcript-first model, but it still reads more like a managed dashboard than a polished AI workspace.

The target for this pass is a whole-app UX refresh with two explicit product goals:

- when the app first launches, it is immediately clear that this is a branded F1 AI race engineer product
- when the user lands on the engineer screen, it is immediately clear how to prompt the AI engineer without needing loud instructional chrome

## Goals

- Establish a clear, branded first-launch experience across the non-engineer path.
- Make the engineer screen feel calm, transcript-first, and immediately promptable.
- Reduce visual heaviness across the app by using fewer borders, fewer saturated colors, and tighter copy.
- Ensure first render states are framed correctly and do not feel cut off or cramped on common terminal sizes.
- Keep the current app flow and screen structure understandable while improving visual coherence.
- Verify the refreshed UI in a live tmux session before calling the pass complete.

## Non-Goals

- Change the core navigation flow between season, meeting, session, downloading, summary, settings, and engineer.
- Rework data fetching, summary generation, agent logic, or streaming behavior.
- Introduce a flashy “racing dashboard” visual system.
- Add modal onboarding, wizard flows, or tutorial overlays.
- Require the engineer screen to explain every feature up front.

## Decision

Adopt a branded-first, restrained-everywhere-else visual system.

The app should make its identity clear at launch, then progressively quiet down as the user moves toward the engineer screen. The engineer route should use minimal onboarding and let the transcript and composer explain the interaction model. Color should support hierarchy, not replace it.

## Design Principles

### Brand Early, Then Get Out Of The Way

The first launch screen and the selection flow should make `f1aire` feel like a product rather than a collection of terminal widgets. Once the user reaches the engineer, branding should recede and the AI workflow should take over visually.

### Transcript And Input Beat Chrome

On the engineer route, transcript and composer are the product. Supporting chrome should remain present only when it genuinely improves orientation or control.

### Calm Terminals Feel Better

The current UI often uses borders, accents, and labels simultaneously. The refresh should reduce this density. Most text should be default foreground or muted gray. Accent colors should be rare and meaningful.

### Responsive Means Intentional, Not Just Fitting

A screen technically fitting in the terminal is not enough. On first render, the eye should land on the right thing, and no critical element should feel squeezed, clipped, or visually crowded.

## Screen Design

### Global Masthead

The current boxed header should become a flatter masthead with clear brand hierarchy.

The masthead should:

- show `f1aire` as the primary brand moment
- keep the “virtual race engineer” framing visible on first launch and selection screens
- reduce border weight and vertical cost compared to the current `Header`
- make breadcrumbs visually secondary rather than competing with the brand

This masthead should be compact enough that it does not steal meaningful vertical space from content on shorter terminals.

### Picker Screens

The season, meeting, session, and settings screens should share a single composition pattern:

- left column: primary action list
- right column: quiet detail panel with context
- short title or subheading above the list
- no repeated “how to use arrows and enter” copy on every panel unless it adds real clarity

The goal is to make the picker flow feel like one coherent sequence rather than several generic Ink screens. The detail panel should support decision-making, not duplicate the selection label.

### Downloading, API Key, And Summary States

The current task states are visually inconsistent. This pass should give them the same product language as the rest of the app.

- downloading should feel like a centered task state, not loose status text
- api key capture should feel deliberate and trustworthy, with clear storage explanation and restrained error styling
- summary should look like a completion state with clear next-step orientation, not just a green success label and a bordered box

## Engineer Screen

### Shell Behavior

The current engineer shell structure is correct and should remain:

- compact session strip at top
- dominant scrollable transcript surface
- pinned composer at bottom
- lightweight scroll-state chrome

This pass should not replace the shell model. It should improve how that shell is visually composed.

### Empty-State Onboarding

The engineer route should explain itself with two subtle cues only:

- a muted opening note in the transcript when the conversation is empty
- a stronger, more specific composer placeholder

The transcript note should feel like the engineer introducing the workspace, not like app documentation. It should include a few concrete examples of the kinds of questions the user can ask, such as pace, tyre life, pit timing, or traffic.

The note should disappear from importance once real conversation starts. It exists to answer “what do I ask?” immediately on first landing.

### Composer

The composer should remain pinned and multiline, but it should feel calmer and more deliberate.

The composer should:

- use a prompt invitation that sounds like a real AI workflow
- avoid looking like a noisy boxed widget
- keep cursor visibility and multiline behavior intact
- keep key hints present but visually secondary

The user should understand how to ask a question just by looking at the transcript opening note and the placeholder, without needing a separate onboarding panel.

### Details And Status

Details should remain collapsed by default and visually secondary.

The “status” concept should be reduced to the minimum useful expression. If a compact status line remains visible above the composer, it should read like supporting telemetry, not like a second header. Expanded details should feel intentionally subordinate to the transcript.

## Color And Emphasis Rules

### Primary Palette

Color should be used with discipline:

- brand green: reserved for product identity moments and occasional positive completion states
- accent cyan: reserved for active selection, cursor emphasis, or a small number of interactive highlights
- default foreground: used for primary content
- muted gray: used for metadata, helper copy, placeholders, and supporting chrome
- semantic warning/error colors: used only for true state signaling

### Transcript Treatment

Transcript content should be less saturated than it is today.

The refresh should reduce or remove strong speaker-label coloring. User and assistant turns should be distinguishable through structure and subtle markers first, not through saturated green and cyan labels. This will make the engineer screen feel closer to a polished AI transcript and less like a color-coded terminal log.

### Borders

Borders should be structural, not decorative.

Most screens should have at most one visually strong framed element. In many cases, lighter framing or no visible border will be better. Rounded boxes should no longer be the default way to imply hierarchy.

## Layout And Framing Rules

### Wide Terminals

On comfortably wide terminals, keep the two-column layout for picker and settings screens. The action list should remain dominant, with the supporting panel sized to avoid truncating the main list.

### Narrower Terminals

When the terminal is too narrow for two columns to breathe, stack the supporting panel below the primary content instead of squeezing both columns into a cramped side-by-side layout.

This rule is important to eliminate the current “technically fits, aesthetically cut off” problem.

### First Render Priorities

On initial render, every screen should expose its main action without making the user scroll or visually decode the layout.

Specifically:

- picker screens should show the brand, the current task, and the active list clearly above the fold
- downloading should show task context and progress state without feeling lost in empty space
- api key should show what the user needs to paste and where it will be stored
- summary should show success context and key session facts cleanly
- engineer should show the session strip, the empty transcript note, and an obvious composer prompt on first render

### Footer Hints

Footer hints should be shortened and made less noisy. They should remain useful, but they should not read like dense keybinding dumps or wrap into visually distracting multi-line blocks on common terminal widths.

## Shared Component Changes

This refresh should be implemented mostly through shared primitives and targeted screen updates rather than one-off styling patches.

The likely shared component surfaces are:

- `Header`
- `FooterHints`
- `Panel`
- `MenuList`
- theme tokens and any shared color helpers

Engineer-specific adjustments should then layer on top of those shared improvements in:

- session strip
- transcript row rendering
- details/status presentation
- composer placeholder and chrome

## Testing And Preview

This pass must be verified in both automated and live workflows.

### Automated Coverage

Add or update tests for:

- header and footer hint rendering behavior
- responsive layout decisions where practical
- engineer empty-state onboarding rendering
- transcript label or marker treatment changes
- composer placeholder and visible first-render behavior

### Live Preview

The final sign-off must include a tmux-driven preview using `npm run dev` that walks the app through:

- launch
- season / meeting / session selection
- downloading / transition states
- engineer first landing
- multiline prompting
- transcript scroll state

The pass is not done until the live preview confirms that the refreshed screens feel intentional, clear, and visually balanced.

## Risks

### Over-Styling

The most likely failure mode is trying to make the app “beautiful” by adding more decoration. That would move the UI away from the target. The right direction is fewer competing treatments, not more.

### Inconsistent Scope

If only the engineer route improves and the rest of the app stays visually old, the product will still feel stitched together. Shared primitives need to carry most of this refresh.

### Responsive Regression

Reducing border and chrome weight must not accidentally hide navigation context or break readability on small terminals. The refresh has to be verified under constrained dimensions, not just ideal ones.

## Implementation Notes

- Keep commit messages focused on `f1aire` goals and behavior.
- Preserve the current shell architecture on the engineer route.
- Prefer shared, token-driven UI cleanup over ad hoc per-screen overrides.
- Treat the live tmux preview as a required part of completion, not an optional polish step.
