# f1aire TUI Architecture

The TUI is split into a few explicit ownership boundaries so shell, transcript,
input, and theme regressions stay localized.

- `src/tui/state/*` owns root route/runtime/UI subscriptions. Screens should read
  selected state slices instead of rebuilding ad hoc global state.
- `src/agent/transcript-events.ts` and
  `src/tui/screens/engineer/transcript-model.ts` own transcript data contracts and
  stable row identities for transcript rendering.
- `src/tui/keybindings/*` owns user-action routing by context. Screen components
  bind actions instead of decoding raw terminal input themselves.
- `src/tui/theme/*` owns semantic visual tokens. Components should consume theme
  roles and avoid hard-coded palette decisions in leaf UI code.
- `EngineerChat` composes the route shell and transcript model, while
  `EngineerShell` and `TranscriptViewport` keep the top strip, scrollable
  transcript, and pinned bottom controls in separate layout slots.
