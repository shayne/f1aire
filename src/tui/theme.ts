import { darkTheme } from './theme/tokens.js';

export { darkTheme, lightTheme, type F1aireTheme } from './theme/tokens.js';
export { ThemeProvider, useTheme } from './theme/provider.js';

export const theme = {
  brand: darkTheme.text.brand,
  accent: darkTheme.chrome.selected,
  text: darkTheme.text.primary,
  muted: darkTheme.text.muted,
  subtle: darkTheme.chrome.subtle,
  border: darkTheme.chrome.border,
  panelTitle: darkTheme.chrome.panelTitle,
  user: darkTheme.transcript.user,
  assistant: darkTheme.transcript.assistant,
  assistantShimmer: darkTheme.status.thinkingShimmer,
  status: {
    thinking: darkTheme.status.thinking,
    thinkingShimmer: darkTheme.status.thinkingShimmer,
    tool: darkTheme.status.tool,
    toolShimmer: darkTheme.status.toolShimmer,
    error: darkTheme.status.error,
    errorShimmer: darkTheme.status.errorShimmer,
    ok: darkTheme.status.ok,
  },
} as const;
