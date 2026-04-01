import { pathToFileURL } from 'node:url';

const OSC8_START = '\u001B]8;;';
const OSC8_END = '\u0007';
const OSC_TITLE_PREFIX = '\u001B]0;';
const OSC_TITLE_SUFFIX = '\u0007';
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

type TerminalTitleOptions = {
  screenName: string;
  breadcrumb?: string[];
  isStreaming: boolean;
};

type TerminalLinkOptions = {
  label?: string;
  supportsHyperlinks?: boolean;
};

function getScreenLabel(screenName: string): string | null {
  switch (screenName) {
    case 'apiKey':
      return 'OpenAI API Key';
    case 'settings':
      return 'Settings';
    case 'summary':
      return 'Summary';
    case 'engineer':
      return 'Engineer';
    case 'downloading':
      return 'Download';
    case 'meeting':
      return 'Meeting';
    case 'session':
      return 'Session';
    default:
      return null;
  }
}

export function buildTerminalTitle({
  screenName,
  breadcrumb = [],
  isStreaming,
}: TerminalTitleOptions): string {
  const normalizedBreadcrumb = breadcrumb.filter(
    (part, index) => !(index === 0 && part === 'F1aire'),
  );
  const fallback = getScreenLabel(screenName);
  const trail =
    normalizedBreadcrumb.length > 0
      ? normalizedBreadcrumb
      : fallback
        ? [fallback]
        : [];
  const base = ['F1aire', ...trail].join(' · ');
  return isStreaming ? `⠂ ${base}` : base;
}

export function supportsHyperlinks(
  output: Pick<NodeJS.WriteStream, 'isTTY'> = process.stdout,
) {
  if (!output.isTTY) return false;
  if (process.env.FORCE_HYPERLINK === '1') return true;
  if (
    process.env.KITTY_WINDOW_ID ||
    process.env.WEZTERM_PANE ||
    process.env.WT_SESSION
  ) {
    return true;
  }
  if (
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    process.env.TERM_PROGRAM === 'vscode'
  ) {
    return true;
  }
  return (process.env.TERM ?? '').includes('xterm-kitty');
}

export function createTerminalLink(
  filePath: string,
  { label = filePath, supportsHyperlinks: supported }: TerminalLinkOptions = {},
): string {
  const canLink = supported ?? supportsHyperlinks();
  if (!canLink) return label;
  const href = pathToFileURL(filePath).href;
  return `${OSC8_START}${href}${OSC8_END}${label}${OSC8_START}${OSC8_END}`;
}

export function writeTerminalTitle(
  title: string,
  output:
    | Pick<NodeJS.WriteStream, 'isTTY' | 'write'>
    | null
    | undefined = process.stdout,
): void {
  if (!output) return;
  const clean = title.replace(ANSI_REGEX, '');
  if (process.platform === 'win32') {
    process.title = clean;
    return;
  }
  output.write(`${OSC_TITLE_PREFIX}${clean}${OSC_TITLE_SUFFIX}`);
}
