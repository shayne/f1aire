import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import type { Meeting, Session } from '../../core/types.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { useTheme } from '../theme/provider.js';

export function Downloading({
  meeting,
  session,
  onStart,
  onComplete,
}: {
  meeting: Meeting;
  session: Session;
  onStart: () => Promise<string>;
  onComplete: (dir: string) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const [status, setStatus] = useState('Starting download...');
  const onStartRef = useRef(onStart);
  const onCompleteRef = useRef(onComplete);
  const runKey = `${meeting.Key}:${session.Key}`;

  useEffect(() => {
    onStartRef.current = onStart;
    onCompleteRef.current = onComplete;
  }, [onStart, onComplete]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setStatus(`Downloading ${meeting.Name} - ${session.Name}...`);
        const dir = await onStartRef.current();
        if (!mounted) return;
        setStatus('Download complete');
        onCompleteRef.current(dir);
      } catch (err) {
        if (!mounted) return;
        setStatus(`Download failed: ${(err as Error).message}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [runKey, meeting.Name, session.Name]);

  const failed = status.startsWith('Download failed:');

  return (
    <ScreenLayout
      columns={columns}
      title="Preparing session"
      subtitle={`${meeting.Name} · ${session.Name}`}
      primary={
        <Panel
          title="Download status"
          tone={failed ? 'neutral' : 'accent'}
          paddingY={1}
        >
          <Box flexDirection="column">
            <Text color={theme.text.primary}>{meeting.Name}</Text>
            <Text color={theme.text.muted} dimColor>
              {session.Name}
            </Text>
            <Text
              color={failed ? theme.status.error : theme.text.muted}
              dimColor={!failed}
            >
              {status}
            </Text>
          </Box>
        </Panel>
      }
      details={
        <Panel title="Next step">
          <Text color={theme.text.muted} dimColor>
            {failed
              ? 'Go back and choose the session again to retry the download.'
              : 'f1aire opens the engineer automatically when the session is ready.'}
          </Text>
        </Panel>
      }
    />
  );
}
