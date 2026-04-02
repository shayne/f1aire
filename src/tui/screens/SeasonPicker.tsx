import React, { useEffect, useMemo, useState } from 'react';
import { Text } from '#ink';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { theme } from '../theme.js';
import { getSeasonOptions } from '../season-utils.js';

export function SeasonPicker({
  onSelect,
}: {
  onSelect: (year: number) => void;
}): React.JSX.Element {
  const currentYear = new Date().getFullYear();
  const seasons = useMemo(
    () => getSeasonOptions(currentYear),
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
    <ScreenLayout
      title="Select a season"
      description="Start with a season, then choose an event and session."
      main={
        <SelectList
          items={seasons.map((year) => ({ label: String(year), value: year }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      }
      detail={
        <Panel title="Season">
          {detailYear !== null ? (
            <>
              <Text>{detailYear}</Text>
              <Text color={theme.subtle} dimColor>
                Load the list of championship weekends for this season.
              </Text>
            </>
          ) : (
            <Text color={theme.subtle} dimColor>
              Pick a year to continue.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
