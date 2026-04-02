import { stringWidth } from '../../../vendor/ink/stringWidth.js';

export type EngineerStatusMode =
  | 'thinking'
  | 'responding'
  | 'requesting'
  | 'tool-use';

export type EngineerStatusShimmerSegments = {
  before: string;
  shimmer: string;
  after: string;
};

const SPINNER_FRAME_INTERVAL_MS = 120;
const SHIMMER_PADDING = 10;
const REQUESTING_SHIMMER_INTERVAL_MS = 50;
const DEFAULT_SHIMMER_INTERVAL_MS = 200;
const TOOL_FLASH_PERIOD_MS = 1000;

function getSpinnerCharacters(): string[] {
  if (process.env.TERM === 'xterm-ghostty') {
    return ['·', '✢', '✳', '✶', '✻', '*'];
  }

  return process.platform === 'darwin'
    ? ['·', '✢', '✳', '✶', '✻', '✽']
    : ['·', '✢', '*', '✶', '✻', '✽'];
}

const SPINNER_FRAMES = [
  ...getSpinnerCharacters(),
  ...[...getSpinnerCharacters()].reverse(),
];

function getGraphemeSegments(message: string): string[] {
  return Array.from(message);
}

export function getEngineerStatusMode(status: string): EngineerStatusMode {
  const normalized = status.toLowerCase();

  if (normalized.includes('processing result')) {
    return 'tool-use';
  }

  if (
    normalized.includes('tool') ||
    normalized.includes('python') ||
    normalized.includes('loading')
  ) {
    return 'requesting';
  }

  if (normalized.includes('thinking')) {
    return 'thinking';
  }

  return 'responding';
}

export function getEngineerStatusGlyph(time: number): string {
  const frame = Math.floor(time / SPINNER_FRAME_INTERVAL_MS);

  return SPINNER_FRAMES[frame % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0]!;
}

export function getEngineerStatusGlimmerIndex({
  mode,
  message,
  time,
}: {
  mode: EngineerStatusMode;
  message: string;
  time: number;
}): number {
  const shimmerIntervalMs =
    mode === 'requesting'
      ? REQUESTING_SHIMMER_INTERVAL_MS
      : DEFAULT_SHIMMER_INTERVAL_MS;
  const messageWidth = stringWidth(message);
  const cycleLength = Math.max(1, messageWidth + SHIMMER_PADDING * 2);
  const cyclePosition = Math.floor(time / shimmerIntervalMs) % cycleLength;

  if (mode === 'requesting') {
    return cyclePosition - SHIMMER_PADDING;
  }

  return messageWidth + SHIMMER_PADDING - cyclePosition;
}

export function getEngineerStatusFlashOn({
  mode,
  time,
}: {
  mode: EngineerStatusMode;
  time: number;
}): boolean {
  return (
    mode === 'tool-use' &&
    (Math.sin((time / TOOL_FLASH_PERIOD_MS) * Math.PI) + 1) / 2 > 0.5
  );
}

export function splitEngineerStatusMessage({
  message,
  glimmerIndex,
}: {
  message: string;
  glimmerIndex: number;
}): EngineerStatusShimmerSegments {
  const messageWidth = stringWidth(message);
  const shimmerStart = glimmerIndex - 1;
  const shimmerEnd = glimmerIndex + 1;

  if (!message || shimmerStart >= messageWidth || shimmerEnd < 0) {
    return {
      before: message,
      shimmer: '',
      after: '',
    };
  }

  const clampedStart = Math.max(0, shimmerStart);
  let column = 0;
  let before = '';
  let shimmer = '';
  let after = '';

  for (const segment of getGraphemeSegments(message)) {
    const width = stringWidth(segment);

    if (column + width <= clampedStart) {
      before += segment;
    } else if (column > shimmerEnd) {
      after += segment;
    } else {
      shimmer += segment;
    }

    column += width;
  }

  return {
    before,
    shimmer,
    after,
  };
}
