import React, { useContext, useEffect } from 'react';
import { Box } from '#ink';
import { ScrollChromeContext } from '../../../vendor/components/FullscreenLayout.js';
import type { TranscriptRow } from './transcript-rows.js';

type TranscriptViewportProps = {
  rows: TranscriptRow[];
  scrollHint: string | null;
  onScrollHintClick?: () => void;
  onRender?: () => void;
};

export const TranscriptViewport = React.memo(function TranscriptViewport({
  rows,
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
      {rows.map((row) => (
        <Box key={row.key}>{row.node}</Box>
      ))}
    </Box>
  );
});
