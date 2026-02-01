import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { Meeting } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';

export function MeetingPicker({
  year,
  meetings,
  onSelect,
}: {
  year: number;
  meetings: Meeting[];
  onSelect: (meeting: Meeting) => void;
}): React.JSX.Element {
  const [highlighted, setHighlighted] = useState<Meeting | null>(
    meetings[0] ?? null,
  );

  useEffect(() => {
    setHighlighted(meetings[0] ?? null);
  }, [meetings]);

  const detailMeeting = highlighted ?? meetings[0] ?? null;

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>
        <Text>Select a meeting for {year}</Text>
        <SelectList
          items={meetings.map((meeting) => ({
            key: String(meeting.Key),
            label: `${meeting.Name} (${meeting.Location})`,
            value: meeting,
          }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      </Box>
      <Box width={38}>
        <Panel title="Meeting">
          {detailMeeting ? (
            <>
              <Text>{detailMeeting.Name}</Text>
              <Text color="gray">{detailMeeting.Location}</Text>
              <Text>Sessions: {detailMeeting.Sessions.length}</Text>
            </>
          ) : (
            <Text color="gray">Highlight a meeting for details.</Text>
          )}
        </Panel>
      </Box>
    </Box>
  );
}
