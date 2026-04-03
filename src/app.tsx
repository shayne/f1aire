import React, { useEffect, useMemo, useState } from 'react';
import { Box, useInput, useStdout, useTerminalSize } from '#ink';
import { formatUnknownError } from './agent/error-utils.js';
import {
  clearStoredOpenAIApiKey,
  getAppConfigPath,
  readAppConfig,
  writeOpenAIApiKey,
} from './core/config.js';
import { downloadSession } from './core/download.js';
import { getMeetings } from './core/f1-api.js';
import { getDataDir } from './core/xdg.js';
import {
  useEngineerSession,
  type PendingEngineer,
} from './tui/app/use-engineer-session.js';
import { useRuntimeBootstrap } from './tui/app/use-runtime-bootstrap.js';
import { useTerminalTitleSync } from './tui/app/use-terminal-title-sync.js';
import {
  FooterHints,
  getFooterHintRowCount,
} from './tui/components/FooterHints.js';
import { Header } from './tui/components/Header.js';
import { getBackScreen, type Screen } from './tui/navigation.js';
import { writeTerminalTitle } from './tui/terminal-chrome.js';
import { Downloading } from './tui/screens/Downloading.js';
import { EngineerChat } from './tui/screens/EngineerChat.js';
import { MeetingPicker } from './tui/screens/MeetingPicker.js';
import { ApiKeyPrompt } from './tui/screens/ApiKeyPrompt.js';
import { RuntimePreparing } from './tui/screens/RuntimePreparing.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Settings, type SettingsAction } from './tui/screens/Settings.js';
import { Summary } from './tui/screens/Summary.js';
import { AppStateProvider, useAppState } from './tui/state/app-store.js';

function AppImpl(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const runtimeReady = useAppState((state) => state.runtime.ready);
  const runtimeMessage = useAppState((state) => state.runtime.message);
  const runtimeProgress = useAppState((state) => state.runtime.progress);
  const [storedApiKey, setStoredApiKey] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const { stdout } = useStdout();
  const { columns: terminalColumns = 100, rows: terminalRows = 40 } =
    useTerminalSize();
  const isShort = terminalRows < 32;
  const configPath = useMemo(() => getAppConfigPath('f1aire'), []);
  const envApiKey =
    typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.trim().length > 0
      ? process.env.OPENAI_API_KEY.trim()
      : null;
  const keyStatus = useMemo(() => {
    const inUse: 'env' | 'stored' | 'none' = envApiKey
      ? 'env'
      : storedApiKey
        ? 'stored'
        : 'none';
    return {
      envKeyPresent: Boolean(envApiKey),
      storedKeyPresent: Boolean(storedApiKey),
      inUse,
    };
  }, [envApiKey, storedApiKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await readAppConfig('f1aire');
        if (cancelled) return;
        const key =
          typeof cfg.openaiApiKey === 'string' &&
          cfg.openaiApiKey.trim().length > 0
            ? cfg.openaiApiKey.trim()
            : null;
        setStoredApiKey(key);
      } catch {
        if (!cancelled) setStoredApiKey(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useRuntimeBootstrap();

  const resolveApiKeyForUse = async (): Promise<string | null> => {
    const fromEnv =
      typeof process.env.OPENAI_API_KEY === 'string' &&
      process.env.OPENAI_API_KEY.trim().length > 0
        ? process.env.OPENAI_API_KEY.trim()
        : null;
    if (fromEnv) return fromEnv;
    if (storedApiKey) return storedApiKey;
    try {
      const cfg = await readAppConfig('f1aire');
      const key =
        typeof cfg.openaiApiKey === 'string' &&
        cfg.openaiApiKey.trim().length > 0
          ? cfg.openaiApiKey.trim()
          : null;
      if (key) setStoredApiKey(key);
      return key;
    } catch {
      return null;
    }
  };

  const {
    activity,
    clearPendingEngineer,
    handleSend,
    isStreaming,
    messages,
    pythonCodePreview,
    queuePendingEngineer,
    startEngineer,
    streamStatus,
    streamingText,
    summary,
    takePendingEngineer,
    timeCursor,
  } = useEngineerSession({
    keyStatus,
    resolveApiKeyForUse,
    screenName: screen.name,
    setScreen,
    storedApiKey,
  });

  const handleApiKeySave = async (apiKey: string) => {
    setApiKeyError(null);
    try {
      await writeOpenAIApiKey('f1aire', apiKey);
      setStoredApiKey(apiKey.trim());
      const pending = takePendingEngineer();
      if (pending) {
        await startEngineer(pending, apiKey.trim());
        return;
      }
      if (screen.name === 'apiKey') {
        setScreen(screen.returnTo);
      }
    } catch (err) {
      setApiKeyError(formatUnknownError(err));
    }
  };

  const handleSettingsAction = (action: SettingsAction) => {
    if (action === 'back') {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
      return;
    }
    if (action === 'paste') {
      setApiKeyError(null);
      setScreen({ name: 'apiKey', returnTo: screen });
      return;
    }
    if (action === 'clear') {
      void (async () => {
        try {
          await clearStoredOpenAIApiKey('f1aire');
          setStoredApiKey(null);
        } catch (err) {
          setApiKeyError(formatUnknownError(err));
        }
      })();
      return;
    }
  };

  const breadcrumb = useMemo(() => {
    if (screen.name === 'season') return ['Season'];
    if (screen.name === 'settings') return ['Settings'];
    if (screen.name === 'apiKey') return ['OpenAI API Key'];
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
    if (screen.name === 'engineer') {
      return [
        `${screen.year}`,
        screen.meeting.Name,
        screen.session.Name,
        'Engineer',
      ];
    }
    if (screen.name === 'summary') return ['Summary'];
    return ['F1aire'];
  }, [screen]);

  useInput((input, key) => {
    if (screen.name === 'engineer' || screen.name === 'apiKey') {
      if (key.escape) {
        if (screen.name === 'apiKey') {
          clearPendingEngineer();
          setApiKeyError(null);
        }
        const next = getBackScreen(screen);
        if (next) setScreen(next);
      }
      if (key.ctrl && input === 'c') process.exit(0);
      return;
    }
    if (
      input === 's' &&
      runtimeReady &&
      (screen.name === 'season' ||
        screen.name === 'meeting' ||
        screen.name === 'session' ||
        screen.name === 'summary')
    ) {
      setApiKeyError(null);
      setScreen({ name: 'settings', returnTo: screen });
      return;
    }
    if (input === 'q') process.exit(0);
    if (input === 'b' || key.backspace || key.escape) {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
    }
  });

  const headerRows = breadcrumb.length ? (isShort ? 4 : 6) : isShort ? 3 : 4;
  const showGlobalChrome = screen.name !== 'engineer';
  const footerRows = showGlobalChrome
    ? getFooterHintRowCount(screen.name, terminalColumns)
    : 0;
  const contentHeight = Math.max(
    terminalRows - (showGlobalChrome ? headerRows : 0) - footerRows,
    10,
  );
  const asOfLabel = timeCursor?.latest
    ? 'Latest'
    : Number.isFinite(timeCursor?.lap)
      ? `Lap ${timeCursor.lap}`
      : timeCursor?.iso
        ? `Time ${timeCursor.iso}`
        : 'Latest';
  const titleWriter = useMemo(
    () => (title: string) => writeTerminalTitle(title, stdout ?? undefined),
    [stdout],
  );

  useTerminalTitleSync({
    screenName: screen.name,
    isStreaming: screen.name === 'engineer' && isStreaming,
    summaryTitle: breadcrumb.join(' · '),
    writeTitle: titleWriter,
  });

  return (
    <Box flexDirection="column" height={terminalRows}>
      {showGlobalChrome ? (
        <Header breadcrumb={breadcrumb} compact={isShort} />
      ) : null}
      <Box
        flexGrow={1}
        flexDirection="column"
        marginLeft={showGlobalChrome ? 1 : 0}
        height={contentHeight}
      >
        {!runtimeReady ? (
          <RuntimePreparing
            message={runtimeMessage}
            progress={runtimeProgress ?? undefined}
          />
        ) : (
          <>
            {screen.name === 'season' && (
              <SeasonPicker
                onSelect={async (year) => {
                  const data = await getMeetings(year);
                  setScreen({ name: 'meeting', year, meetings: data.Meetings });
                }}
              />
            )}
            {screen.name === 'settings' && (
              <Settings status={keyStatus} onAction={handleSettingsAction} />
            )}
            {screen.name === 'apiKey' && (
              <ApiKeyPrompt
                configPath={configPath}
                onSave={handleApiKeySave}
                error={apiKeyError}
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
                  void (async () => {
                    const key = await resolveApiKeyForUse();
                    const pending: PendingEngineer = {
                      year: screen.year,
                      meetings: screen.meetings,
                      meeting: screen.meeting,
                      session: screen.session,
                      dir,
                    };
                    if (!key) {
                      queuePendingEngineer(pending);
                      setApiKeyError(null);
                      setScreen({
                        name: 'apiKey',
                        returnTo: getBackScreen(screen) ?? { name: 'season' },
                      });
                      return;
                    }
                    await startEngineer(pending, key);
                  })();
                }}
                onStart={async () => {
                  const root = getDataDir('f1aire');
                  const result = await downloadSession({
                    year: screen.year,
                    meeting: screen.meeting,
                    sessionKey: screen.session.Key,
                    dataRoot: root,
                    allowExisting: true,
                  });
                  return result.dir;
                }}
              />
            )}
            {screen.name === 'engineer' && (
              <EngineerChat
                messages={messages}
                streamingText={streamingText}
                onSend={handleSend}
                isStreaming={isStreaming}
                status={streamStatus}
                year={screen.year}
                meeting={screen.meeting}
                session={screen.session}
                summary={summary}
                activity={activity}
                pythonCode={pythonCodePreview}
                asOfLabel={asOfLabel}
              />
            )}
            {screen.name === 'summary' && (
              <Summary summary={screen.summary} dir={screen.dir} />
            )}
          </>
        )}
      </Box>
      {showGlobalChrome ? <FooterHints screen={screen.name} /> : null}
    </Box>
  );
}

export function App(): React.JSX.Element {
  return (
    <AppStateProvider>
      <AppImpl />
    </AppStateProvider>
  );
}
