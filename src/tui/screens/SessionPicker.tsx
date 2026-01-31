import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import type { Meeting, Session } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';

export function SessionPicker({
  meeting,
  onSelect,
}: {
  meeting: Meeting;
  onSelect: (session: Session) => void;
}): React.JSX.Element {
  const sessions = meeting.Sessions;
  const [highlighted, setHighlighted] = useState<Session | null>(
    sessions[0] ?? null,
  );

  useEffect(() => {
    setHighlighted(sessions[0] ?? null);
  }, [sessions]);

  const detailSession = highlighted ?? sessions[0] ?? null;

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>
        <Text>Select a session for {meeting.Name}</Text>
        <SelectList
          items={sessions.map((session) => ({
            label: `${session.Name} (${session.Type})`,
            value: session,
          }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      </Box>
      <Box width={38}>
        <Panel title="Session">
          {detailSession ? (
            <>
              <Text>{detailSession.Name}</Text>
              <Text color="gray">Type: {detailSession.Type}</Text>
              <Text>Start: {detailSession.StartDate}</Text>
              <Text>End: {detailSession.EndDate}</Text>
            </>
          ) : (
            <Text color="gray">Highlight a session for details.</Text>
          )}
        </Panel>
      </Box>
    </Box>
  );
}
