import React, { useEffect, useState } from 'react';
import { Text, useTerminalSize } from '#ink';
import type { Meeting, Session } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { useTheme } from '../theme/provider.js';

export function SessionPicker({
  meeting,
  onSelect,
}: {
  meeting: Meeting;
  onSelect: (session: Session) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
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
      columns={columns}
      title="Select a session"
      subtitle={`Download a ${meeting.Name} session for the race engineer.`}
      primary={
        sessions.length > 0 ? (
          <SelectList
            items={sessions.map((session) => ({
              key: String(session.Key),
              label: `${session.Name} (${session.Type})`,
              value: session,
            }))}
            onSelect={onSelect}
            onHighlight={setHighlighted}
          />
        ) : (
          <Panel title="No sessions" tone="muted">
            <Text color={theme.text.primary}>
              No sessions found for {meeting.Name}.
            </Text>
            <Text color={theme.text.muted} dimColor>
              Go back and choose another meeting.
            </Text>
          </Panel>
        )
      }
      details={
        <Panel title="Session">
          {detailSession ? (
            <>
              <Text color={theme.text.primary}>{detailSession.Name}</Text>
              <Text color={theme.text.muted} dimColor>
                {detailSession.Type}
              </Text>
              <Text color={theme.text.muted} dimColor>
                Start {detailSession.StartDate}
              </Text>
              <Text color={theme.text.muted} dimColor>
                End {detailSession.EndDate}
              </Text>
            </>
          ) : (
            <Text color={theme.text.muted} dimColor>
              The current timing feed did not return any sessions for this
              meeting.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
