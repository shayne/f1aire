import React, { useEffect } from 'react';
import { Box, Text } from '#ink';
import type { TranscriptRow } from './transcript-rows.js';

type TranscriptViewportProps = {
  rows: TranscriptRow[];
  scrollHint: string | null;
  onRender?: () => void;
};

export const TranscriptViewport = React.memo(function TranscriptViewport({
  rows,
  scrollHint,
  onRender,
}: TranscriptViewportProps): React.JSX.Element {
  useEffect(() => {
    onRender?.();
  });

  return (
    <Box flexDirection="column">
      {scrollHint ? (
        <Box flexDirection="column">
          <Text color="ansi:blackBright" wrap="truncate-end">
            {scrollHint}
          </Text>
          <Text color="ansi:blackBright" wrap="truncate-end">
            Jump to bottom
          </Text>
        </Box>
      ) : null}
      {rows.map((row) => (
        <Box key={row.key}>{row.node}</Box>
      ))}
    </Box>
  );
});
