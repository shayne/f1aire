import fs from 'node:fs';
import path from 'node:path';
import React, { useMemo, useState } from 'react';
import { Box, useInput } from 'ink';
import { downloadSession } from './core/download.js';
import { getMeetings } from './core/f1-api.js';
import { summarizeFromLines } from './core/summary.js';
import { getDataDir } from './core/xdg.js';
import { FooterHints } from './tui/components/FooterHints.js';
import { Header } from './tui/components/Header.js';
import { getBackScreen, type Screen } from './tui/navigation.js';
import { Downloading } from './tui/screens/Downloading.js';
import { MeetingPicker } from './tui/screens/MeetingPicker.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Summary } from './tui/screens/Summary.js';

export function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const breadcrumb = useMemo(() => {
    if (screen.name === 'season') return ['Season'];
    if (screen.name === 'meeting') return [`${screen.year}`, 'Meeting'];
    if (screen.name === 'session') {
      return [`${screen.year}`, screen.meeting.Name, 'Session'];
    }
    if (screen.name === 'downloading') {
      return [
        `${screen.year}`,
        screen.meeting.Name,
        screen.session.Name,
        'Download',
      ];
    }
    if (screen.name === 'summary') return ['Summary'];
    return ['F1aire'];
  }, [screen]);

  useInput((input, key) => {
    if (input === 'q') process.exit(0);
    if (input === 'b' || key.backspace || key.escape) {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
    }
  });

  return (
    <Box flexDirection="column">
      <Header breadcrumb={breadcrumb} />
      <Box flexGrow={1} flexDirection="column" marginLeft={1}>
        {screen.name === 'season' && (
          <SeasonPicker
            onSelect={async (year) => {
              const data = await getMeetings(year);
              setScreen({ name: 'meeting', year, meetings: data.Meetings });
            }}
          />
        )}
        {screen.name === 'meeting' && (
          <MeetingPicker
            year={screen.year}
            meetings={screen.meetings}
            onSelect={(meeting) =>
              setScreen({
                name: 'session',
                year: screen.year,
                meetings: screen.meetings,
                meeting,
              })
            }
          />
        )}
        {screen.name === 'session' && (
          <SessionPicker
            meeting={screen.meeting}
            onSelect={(session) =>
              setScreen({
                name: 'downloading',
                year: screen.year,
                meetings: screen.meetings,
                meeting: screen.meeting,
                session,
              })
            }
          />
        )}
        {screen.name === 'downloading' && (
          <Downloading
            meeting={screen.meeting}
            session={screen.session}
            onComplete={(dir) => {
              const livePath = path.join(dir, 'live.jsonl');
              const lines = fs.readFileSync(livePath, 'utf-8');
              const summary = summarizeFromLines(lines);
              setScreen({
                name: 'summary',
                year: screen.year,
                meetings: screen.meetings,
                meeting: screen.meeting,
                summary,
                dir,
              });
            }}
            onStart={async () => {
              const root = getDataDir('f1aire');
              const result = await downloadSession({
                year: screen.year,
                meeting: screen.meeting,
                sessionKey: screen.session.Key,
                dataRoot: root,
              });
              return result.dir;
            }}
          />
        )}
        {screen.name === 'summary' && (
          <Summary summary={screen.summary} dir={screen.dir} />
        )}
      </Box>
      <FooterHints />
    </Box>
  );
}
