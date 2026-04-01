import React, { useEffect, useState } from 'react';
import { Text } from '#ink';
import type { Meeting, Session } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { theme } from '../theme.js';

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
    <ScreenLayout
      title={`Select a session for ${meeting.Name}`}
      description="Choose the session to download and hand off to the engineer."
      main={
        <SelectList
          items={sessions.map((session) => ({
            key: String(session.Key),
            label: `${session.Name} (${session.Type})`,
            value: session,
          }))}
          onSelect={onSelect}
          onHighlight={setHighlighted}
        />
      }
      detail={
        <Panel title="Session">
          {detailSession ? (
            <>
              <Text>{detailSession.Name}</Text>
              <Text color={theme.subtle}>{detailSession.Type}</Text>
              <Text color={theme.subtle}>Start {detailSession.StartDate}</Text>
              <Text color={theme.subtle}>End {detailSession.EndDate}</Text>
            </>
          ) : (
            <Text color={theme.subtle}>Highlight a session for details.</Text>
          )}
        </Panel>
      }
    />
  );
}
