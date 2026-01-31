import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';

export function SeasonPicker({
  onSelect,
}: {
  onSelect: (year: number) => void;
}): React.JSX.Element {
  const currentYear = new Date().getFullYear();
  const seasons = useMemo(
    () => Array.from({ length: 10 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const [highlighted, setHighlighted] = useState<number | null>(
    seasons[0] ?? null,
  );

  useEffect(() => {
    setHighlighted(seasons[0] ?? null);
  }, [seasons]);

  const detailYear = highlighted ?? seasons[0] ?? null;

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>
        <Text>Select a season</Text>
        <SelectList
          items={seasons.map((year) => ({ label: String(year), value: year }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      </Box>
      <Box width={38}>
        <Panel title="Season">
          {detailYear !== null ? (
            <>
              <Text>Year: {detailYear}</Text>
              <Text color="gray">Press enter to load meetings.</Text>
            </>
          ) : (
            <Text color="gray">Pick a year to load meetings.</Text>
          )}
        </Panel>
      </Box>
    </Box>
  );
}
