import React, { useContext, useEffect } from 'react';
import { Box } from '#ink';
import { ScrollChromeContext } from '../../../vendor/components/FullscreenLayout.js';
import type { TranscriptRow } from './transcript-rows.js';

type TranscriptViewportProps = {
  rows: TranscriptRow[];
  topSpacerRows?: number;
  bottomSpacerRows?: number;
  scrollHint: string | null;
  onScrollHintClick?: () => void;
  onRender?: () => void;
};

const TranscriptViewportRow = React.memo(function TranscriptViewportRow({
  row,
}: {
  row: TranscriptRow;
}): React.JSX.Element {
  return <Box>{row.node}</Box>;
});

export const TranscriptViewport = React.memo(function TranscriptViewport({
  rows,
  topSpacerRows = 0,
  bottomSpacerRows = 0,
  scrollHint,
  onScrollHintClick,
  onRender,
}: TranscriptViewportProps): React.JSX.Element {
  const { setStickyPrompt } = useContext(ScrollChromeContext);

  useEffect(() => {
    onRender?.();
  });

  useEffect(() => {
    if (!scrollHint) {
      setStickyPrompt(null);
      return;
    }

    setStickyPrompt({
      text: scrollHint,
      scrollTo: onScrollHintClick ?? (() => {}),
    });

    return () => {
      setStickyPrompt(null);
    };
  }, [onScrollHintClick, scrollHint, setStickyPrompt]);

  return (
    <Box flexDirection="column">
      {topSpacerRows > 0 ? <Box flexShrink={0} height={topSpacerRows} /> : null}
      {rows.map((row) => (
        <TranscriptViewportRow key={row.key} row={row} />
      ))}
      {bottomSpacerRows > 0 ? (
        <Box flexShrink={0} height={bottomSpacerRows} />
      ) : null}
    </Box>
  );
});
