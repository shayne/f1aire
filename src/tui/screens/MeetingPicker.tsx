import React, { useEffect, useState } from 'react';
import { Text } from '#ink';
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
  const [highlighted, setHighlighted] = useState<Meeting | null>(
    meetings[0] ?? null,
  );

  useEffect(() => {
    setHighlighted(meetings[0] ?? null);
  }, [meetings]);

  const detailMeeting = highlighted ?? meetings[0] ?? null;

  return (
    <ScreenLayout
      title={`Select a meeting for ${year}`}
      description="Pick the race weekend or test event you want to analyze."
      main={
        <SelectList
          items={meetings.map((meeting) => ({
            key: String(meeting.Key),
            label: `${meeting.Name} (${meeting.Location})`,
            value: meeting,
          }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      }
      detail={
        <Panel title="Meeting">
          {detailMeeting ? (
            <>
              <Text>{detailMeeting.Name}</Text>
              <Text color={theme.text.muted} dimColor>
                {detailMeeting.Location}
              </Text>
              <Text color={theme.text.muted} dimColor>
                {detailMeeting.Sessions.length} sessions available
              </Text>
            </>
          ) : (
            <Text color={theme.text.muted} dimColor>
              Highlight a meeting for details.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
