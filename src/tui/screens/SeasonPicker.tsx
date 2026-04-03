import React, { useEffect, useMemo, useState } from 'react';
import { Text, useTerminalSize } from '#ink';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { getSeasonOptions } from '../season-utils.js';
import { useTheme } from '../theme/provider.js';

export function SeasonPicker({
  onSelect,
}: {
  onSelect: (year: number) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
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
      columns={columns}
      title="Select a season"
      subtitle="Start a f1aire race-engineer session with a championship year."
      primary={
        <SelectList
          items={seasons.map((year) => ({ label: String(year), value: year }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      }
      details={
        <Panel title="Start here" tone="accent">
          {detailYear !== null ? (
            <>
              <Text color={theme.text.primary}>
                Choose a championship year to open its race weekends.
              </Text>
              <Text color={theme.text.muted} dimColor>
                Load race weekends and sessions from {detailYear}.
              </Text>
            </>
          ) : (
            <Text color={theme.text.muted} dimColor>
              Choose a championship year to continue.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
