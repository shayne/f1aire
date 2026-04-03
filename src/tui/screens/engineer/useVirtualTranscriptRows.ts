import { useMemo } from 'react';

const DEFAULT_OVERSCAN_ROWS = 8;

export type VirtualTranscriptWindow<TranscriptRow> = {
  visibleRows: TranscriptRow[];
  topSpacerRows: number;
  bottomSpacerRows: number;
};

export function getVirtualTranscriptWindow<TranscriptRow>({
  rows,
  viewportRows,
  scrollOffset,
  overscan,
}: {
  rows: TranscriptRow[];
  viewportRows: number;
  scrollOffset: number;
  overscan: number;
}): VirtualTranscriptWindow<TranscriptRow> {
  const normalizedViewportRows = Math.max(0, Math.floor(viewportRows));
  const normalizedScrollOffset = Math.min(
    rows.length,
    Math.max(0, Math.floor(scrollOffset)),
  );
  const normalizedOverscan = Math.max(0, Math.floor(overscan));
  const start = Math.min(
    rows.length,
    Math.max(0, normalizedScrollOffset - normalizedOverscan),
  );
  const end = Math.max(
    start,
    Math.min(
      rows.length,
      normalizedScrollOffset + normalizedViewportRows + normalizedOverscan,
    ),
  );

  return {
    visibleRows: rows.slice(start, end),
    topSpacerRows: start,
    bottomSpacerRows: rows.length - end,
  };
}

export function useVirtualTranscriptRows<TranscriptRow>({
  rows,
  viewportRows,
  scrollOffset,
  overscan = DEFAULT_OVERSCAN_ROWS,
}: {
  rows: TranscriptRow[];
  viewportRows: number;
  scrollOffset: number;
  overscan?: number;
}): VirtualTranscriptWindow<TranscriptRow> {
  return useMemo(
    () =>
      getVirtualTranscriptWindow({
        rows,
        viewportRows,
        scrollOffset,
        overscan,
      }),
    [overscan, rows, scrollOffset, viewportRows],
  );
}
