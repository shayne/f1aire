import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../theme.js';
import type { TranscriptRow } from './transcript-rows.js';

type TranscriptViewportProps = {
  visibleRows: TranscriptRow[];
  scrollHint: string | null;
  height?: number;
  onRender?: () => void;
};

export const TranscriptViewport = React.memo(function TranscriptViewport({
  visibleRows,
  scrollHint,
  height,
  onRender,
}: TranscriptViewportProps): React.JSX.Element {
  useEffect(() => {
    onRender?.();
  });

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      overflow="hidden"
      height={height}
    >
      {scrollHint ? (
        <Text color={theme.muted} wrap="truncate-end">
          {scrollHint}
        </Text>
      ) : null}
      {visibleRows.map((row) => (
        <Box key={row.key}>{row.node}</Box>
      ))}
    </Box>
  );
});
