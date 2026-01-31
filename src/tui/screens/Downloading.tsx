import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setStatus(`Downloading ${meeting.Name} - ${session.Name}...`);
        const dir = await onStart();
        if (!mounted) return;
        setStatus('Download complete');
        onComplete(dir);
      } catch (err) {
        if (!mounted) return;
        setStatus(`Download failed: ${(err as Error).message}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [meeting, session, onStart, onComplete]);

  return <Text>{status}</Text>;
}
