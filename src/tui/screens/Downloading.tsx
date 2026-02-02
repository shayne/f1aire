import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'ink';
import type { Meeting, Session } from '../../core/types.js';

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

  return <Text>{status}</Text>;
}
