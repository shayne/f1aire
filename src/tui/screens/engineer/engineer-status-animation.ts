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

export const F1AIRE_STATUS_FRAMES = ['▁', '▃', '▅', '▇', '▅', '▃'];

let graphemeSegmenter: Intl.Segmenter | null | undefined;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  graphemeSegmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;

  return graphemeSegmenter;
}

function getGraphemeSegments(message: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    return Array.from(
      segmenter.segment(message),
      ({ segment }) => segment,
    );
  }

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

  return (
    F1AIRE_STATUS_FRAMES[frame % F1AIRE_STATUS_FRAMES.length] ??
    F1AIRE_STATUS_FRAMES[0]!
  );
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

export function getEngineerStatusFlashOpacity({
  mode,
  time,
}: {
  mode: EngineerStatusMode;
  time: number;
}): number {
  if (mode !== 'tool-use') {
    return 0;
  }

  return (Math.sin((time / TOOL_FLASH_PERIOD_MS) * Math.PI) + 1) / 2;
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
