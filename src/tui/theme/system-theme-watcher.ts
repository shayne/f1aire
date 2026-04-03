import {
  oscColor,
  type TerminalQuerier,
} from '../../vendor/ink/terminal-querier.js';
import {
  setCachedSystemTheme,
  themeFromOscColor,
  type SystemThemeName,
} from './system-theme.js';

const POLL_INTERVAL_MS = 2_000;

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
