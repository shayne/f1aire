import React, { useEffect, useState } from 'react';
import { Text, useTerminalSize } from '#ink';
import type { Meeting } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { useTheme } from '../theme/provider.js';

export function MeetingPicker({
  year,
  meetings,
  onSelect,
}: {
  year: number;
  meetings: Meeting[];
  onSelect: (meeting: Meeting) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const [highlighted, setHighlighted] = useState<Meeting | null>(
    meetings[0] ?? null,
  );

  useEffect(() => {
    setHighlighted(meetings[0] ?? null);
  }, [meetings]);

  const detailMeeting = highlighted ?? meetings[0] ?? null;

  return (
    <ScreenLayout
      columns={columns}
      title="Select a meeting"
      subtitle={`Choose a race weekend or test from the ${year} season.`}
      primary={
        meetings.length > 0 ? (
          <SelectList
            items={meetings.map((meeting) => ({
              key: String(meeting.Key),
              label: `${meeting.Name} (${meeting.Location})`,
              value: meeting,
            }))}
            onSelect={onSelect}
            onHighlight={setHighlighted}
          />
        ) : (
          <Panel title="No meetings" tone="muted">
            <Text color={theme.text.primary}>
              No meetings found for {year}.
            </Text>
            <Text color={theme.text.muted} dimColor>
              Go back and choose another season.
            </Text>
          </Panel>
        )
      }
      details={
        <Panel title="Meeting">
          {detailMeeting ? (
            <>
              <Text color={theme.text.primary}>{detailMeeting.Name}</Text>
              <Text color={theme.text.muted} dimColor>
                {detailMeeting.Location}
              </Text>
              <Text color={theme.text.muted} dimColor>
                {detailMeeting.Sessions.length} sessions available.
              </Text>
            </>
          ) : (
            <Text color={theme.text.muted} dimColor>
              The current timing feed did not return any meetings for this
              season.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
