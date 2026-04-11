import fs from 'node:fs';
import path from 'node:path';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Box,
  useInput,
  useSelection,
  useStdout,
  useTerminalSize,
} from '#ink';
import { formatUnknownError } from './agent/error-utils.js';
import {
  getTranscriptSessionKey,
  loadTranscriptEvents,
} from './agent/session-transcript-store.js';
import {
  clearStoredOpenAIApiKey,
  clearStoredOpenAIChatGptAuth,
  getAppConfigPath,
  readAppConfig,
  writeOpenAIAuthPreference,
  writeOpenAIApiKey,
  type AppConfig,
  type OpenAIAuthPreference,
  type OpenAIChatGptAuthConfig,
} from './core/config.js';
import { downloadSession } from './core/download.js';
import { getMeetings } from './core/f1-api.js';
import {
  resolveOpenAIAuthForUse,
  type ResolvedOpenAIAuth,
} from './core/openai-auth.js';
import { summarizeFromLines } from './core/summary.js';
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
import type { Keybinding } from './tui/keybindings/actions.js';
import { useKeybindings } from './tui/keybindings/use-keybindings.js';
import { getBackScreen, type Screen } from './tui/navigation.js';
import { writeTerminalTitle } from './tui/terminal-chrome.js';
import { Downloading } from './tui/screens/Downloading.js';
import { EngineerChat } from './tui/screens/EngineerChat.js';
import { MeetingPicker } from './tui/screens/MeetingPicker.js';
import { ApiKeyPrompt } from './tui/screens/ApiKeyPrompt.js';
import { ChatGptAuthPrompt } from './tui/screens/ChatGptAuthPrompt.js';
import { OpenAIAuthPrompt } from './tui/screens/OpenAIAuthPrompt.js';
import { RuntimePreparing } from './tui/screens/RuntimePreparing.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Settings, type SettingsAction } from './tui/screens/Settings.js';
import { Summary, type SummaryLaunchAction } from './tui/screens/Summary.js';
import { AppStateProvider, useAppState } from './tui/state/app-store.js';
import { ThemeProvider } from './tui/theme/provider.js';

type OpenAIAuthStatus = {
  chatGptAccountEmail?: string;
  chatGptPlanType?: string;
  chatGptSignedIn: boolean;
  envKeyPresent: boolean;
  openaiAuthPreference: OpenAIAuthPreference;
  storedKeyPresent: boolean;
  inUse: 'chatgpt' | 'env' | 'stored' | 'none';
};

function getEnvOpenAIApiKey(): string | null {
  return typeof process.env.OPENAI_API_KEY === 'string' &&
    process.env.OPENAI_API_KEY.trim().length > 0
    ? process.env.OPENAI_API_KEY.trim()
    : null;
}

function toOpenAIAuthStatus(config: AppConfig): OpenAIAuthStatus {
  const envKeyPresent = Boolean(getEnvOpenAIApiKey());
  const openaiAuthPreference = config.openaiAuthPreference ?? 'chatgpt';
  const chatGptSignedIn = Boolean(config.openaiChatGptAuth?.accessToken);
  const storedKeyPresent = Boolean(config.openaiApiKey);
  const inUse =
    openaiAuthPreference === 'chatgpt'
      ? chatGptSignedIn
        ? 'chatgpt'
        : 'none'
      : envKeyPresent
        ? 'env'
        : storedKeyPresent
          ? 'stored'
          : 'none';

  return {
    chatGptSignedIn,
    envKeyPresent,
    inUse,
    openaiAuthPreference,
    storedKeyPresent,
    ...(config.openaiChatGptAuth?.accountEmail
      ? { chatGptAccountEmail: config.openaiChatGptAuth.accountEmail }
      : {}),
    ...(config.openaiChatGptAuth?.planType
      ? { chatGptPlanType: config.openaiChatGptAuth.planType }
      : {}),
  };
}

function AppImpl(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const runtimeReady = useAppState((state) => state.runtime.ready);
  const runtimeMessage = useAppState((state) => state.runtime.message);
  const runtimeProgress = useAppState((state) => state.runtime.progress);
  const [authStatus, setAuthStatus] = useState<OpenAIAuthStatus>(() =>
    toOpenAIAuthStatus({}),
  );
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [summaryHasPriorTranscript, setSummaryHasPriorTranscript] =
    useState(false);
  const [summaryLaunchAction, setSummaryLaunchAction] =
    useState<SummaryLaunchAction | null>(null);
  const [engineerLeavePromptVisible, setEngineerLeavePromptVisible] =
    useState(false);
  const [engineerQuitPromptVisible, setEngineerQuitPromptVisible] =
    useState(false);
  const engineerQuitPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const { stdout } = useStdout();
  const selection = useSelection();
  const { columns: terminalColumns = 100, rows: terminalRows = 40 } =
    useTerminalSize();
  const isShort = terminalRows < 32;
  const configPath = useMemo(() => getAppConfigPath('f1aire'), []);
  const refreshAuthStatus = useCallback(async (): Promise<AppConfig> => {
    const cfg = await readAppConfig('f1aire');
    setAuthStatus(toOpenAIAuthStatus(cfg));
    return cfg;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await readAppConfig('f1aire');
        if (cancelled) return;
        setAuthStatus(toOpenAIAuthStatus(cfg));
      } catch {
        if (!cancelled) setAuthStatus(toOpenAIAuthStatus({}));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useRuntimeBootstrap();

  const resolveAuthForUse = useCallback(
    async (): Promise<ResolvedOpenAIAuth | null> => {
      try {
        const auth = await resolveOpenAIAuthForUse('f1aire');
        await refreshAuthStatus();
        return auth;
      } catch {
        return null;
      }
    },
    [refreshAuthStatus],
  );

  const resolveApiKeyForUse = useCallback(async (): Promise<string | null> => {
    const auth = await resolveAuthForUse();
    return auth?.kind === 'api-key' ? auth.apiKey : null;
  }, [resolveAuthForUse]);

  const openAuthGate = useCallback(
    async (returnTo: Screen): Promise<void> => {
      const cfg = await refreshAuthStatus();
      setApiKeyError(null);
      if (cfg.openaiAuthPreference === 'api-key') {
        setScreen({ name: 'apiKey', returnTo });
        return;
      }
      setScreen({ name: 'openaiAuth', returnTo });
    },
    [refreshAuthStatus],
  );

  const {
    activity,
    clearPendingEngineer,
    handleSend,
    interruptEngineerTurn,
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
    keyStatus: authStatus,
    resolveOpenAIAuthForUse: resolveAuthForUse,
    resolveApiKeyForUse,
    screenName: screen.name,
    setScreen,
    storedApiKey: authStatus.storedKeyPresent ? 'stored' : null,
  });

  const handleApiKeySave = async (apiKey: string) => {
    setApiKeyError(null);
    try {
      await writeOpenAIApiKey('f1aire', apiKey);
      await refreshAuthStatus();
      const pending = takePendingEngineer();
      if (pending) {
        const auth = await resolveAuthForUse();
        if (!auth) {
          queuePendingEngineer(pending);
          if (screen.name === 'apiKey') {
            await openAuthGate(screen.returnTo);
          }
          return;
        }
        await startEngineer(pending, auth);
        return;
      }
      if (screen.name === 'apiKey') {
        setScreen(screen.returnTo);
      }
    } catch (err) {
      setApiKeyError(formatUnknownError(err));
    }
  };

  const handleOpenAIAuthPromptSelect = useCallback(
    (action: 'chatgpt' | 'api-key' | 'back') => {
      if (screen.name !== 'openaiAuth') {
        return;
      }

      if (action === 'back') {
        if (screen.returnTo.name !== 'summary') {
          clearPendingEngineer();
          setSummaryHasPriorTranscript(false);
        }
        setSummaryLaunchAction(null);
        setApiKeyError(null);
        setScreen(screen.returnTo);
        return;
      }

      if (action === 'chatgpt') {
        void (async () => {
          await writeOpenAIAuthPreference('f1aire', 'chatgpt');
          await refreshAuthStatus();
          setScreen({
            name: 'chatGptAuth',
            returnTo: { name: 'openaiAuth', returnTo: screen.returnTo },
          });
        })().catch((err) => {
          setApiKeyError(formatUnknownError(err));
        });
        return;
      }

      void (async () => {
        await writeOpenAIAuthPreference('f1aire', 'api-key');
        await refreshAuthStatus();
        const pending = takePendingEngineer();
        const auth = await resolveAuthForUse();
        if (pending && auth) {
          await startEngineer(pending, auth);
          return;
        }
        if (pending) {
          queuePendingEngineer(pending);
        }
        setScreen({ name: 'apiKey', returnTo: screen.returnTo });
      })().catch((err) => {
        setApiKeyError(formatUnknownError(err));
      });
    },
    [
      clearPendingEngineer,
      queuePendingEngineer,
      refreshAuthStatus,
      resolveAuthForUse,
      screen,
      startEngineer,
      takePendingEngineer,
    ],
  );

  const handleChatGptAuthDone = useCallback(
    (auth: OpenAIChatGptAuthConfig) => {
      void (async () => {
        await refreshAuthStatus();
        const pending = takePendingEngineer();
        if (pending) {
          await startEngineer(pending, { kind: 'chatgpt', ...auth });
          return;
        }
        if (screen.name === 'chatGptAuth') {
          setScreen(screen.returnTo);
        }
      })().catch((err) => {
        setApiKeyError(formatUnknownError(err));
        if (screen.name === 'chatGptAuth') {
          setScreen(screen.returnTo);
        }
      });
    },
    [refreshAuthStatus, screen, startEngineer, takePendingEngineer],
  );

  const handleChatGptAuthCancel = useCallback(() => {
    if (screen.name === 'chatGptAuth') {
      setScreen(screen.returnTo);
    }
  }, [screen]);

  const handleSettingsAction = (action: SettingsAction) => {
    if (action === 'back') {
      const next = getBackScreen(screen);
      if (next) setScreen(next);
      return;
    }
    if (action === 'chatgpt') {
      setApiKeyError(null);
      setScreen({ name: 'chatGptAuth', returnTo: screen });
      return;
    }
    if (action === 'prefer-chatgpt') {
      void (async () => {
        await writeOpenAIAuthPreference('f1aire', 'chatgpt');
        await refreshAuthStatus();
      })().catch((err) => {
        setApiKeyError(formatUnknownError(err));
      });
      return;
    }
    if (action === 'prefer-api-key') {
      void (async () => {
        await writeOpenAIAuthPreference('f1aire', 'api-key');
        await refreshAuthStatus();
      })().catch((err) => {
        setApiKeyError(formatUnknownError(err));
      });
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
          await refreshAuthStatus();
        } catch (err) {
          setApiKeyError(formatUnknownError(err));
        }
      })();
      return;
    }
    if (action === 'clear-chatgpt') {
      void (async () => {
        try {
          await clearStoredOpenAIChatGptAuth('f1aire');
          await refreshAuthStatus();
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
    if (screen.name === 'openaiAuth') return ['OpenAI Auth'];
    if (screen.name === 'chatGptAuth') return ['ChatGPT Sign In'];
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

  const handleGlobalBack = useCallback((): void => {
    if (
      screen.name === 'apiKey' ||
      screen.name === 'openaiAuth' ||
      screen.name === 'chatGptAuth'
    ) {
      if (screen.returnTo.name !== 'summary') {
        clearPendingEngineer();
        setSummaryHasPriorTranscript(false);
      }
      setSummaryLaunchAction(null);
      setApiKeyError(null);
    }
    if (screen.name === 'summary') {
      clearPendingEngineer();
      setApiKeyError(null);
      setSummaryHasPriorTranscript(false);
      setSummaryLaunchAction(null);
    }

    const next = getBackScreen(screen);
    if (next) setScreen(next);
  }, [clearPendingEngineer, screen]);

  const clearEngineerQuitPrompt = useCallback((): void => {
    if (engineerQuitPromptTimerRef.current) {
      clearTimeout(engineerQuitPromptTimerRef.current);
      engineerQuitPromptTimerRef.current = null;
    }
    setEngineerQuitPromptVisible(false);
  }, []);

  const armEngineerQuitPrompt = useCallback((): void => {
    clearEngineerQuitPrompt();
    setEngineerQuitPromptVisible(true);
    engineerQuitPromptTimerRef.current = setTimeout(() => {
      engineerQuitPromptTimerRef.current = null;
      setEngineerQuitPromptVisible(false);
    }, 2000);
  }, [clearEngineerQuitPrompt]);

  useEffect(() => {
    if (screen.name === 'engineer') return;
    setEngineerLeavePromptVisible(false);
    clearEngineerQuitPrompt();
  }, [clearEngineerQuitPrompt, screen.name]);

  useEffect(
    () => () => {
      if (engineerQuitPromptTimerRef.current) {
        clearTimeout(engineerQuitPromptTimerRef.current);
        engineerQuitPromptTimerRef.current = null;
      }
    },
    [],
  );

  const handleSummaryLaunch = useCallback(
    (launchAction: SummaryLaunchAction): boolean | void => {
      if (screen.name !== 'summary') {
        return false;
      }

      const pending = takePendingEngineer();
      if (!pending) {
        setSummaryHasPriorTranscript(false);
        setSummaryLaunchAction(null);
        return;
      }
      setApiKeyError(null);
      setSummaryLaunchAction(launchAction);

      void (async () => {
        const auth = await resolveAuthForUse();
        if (!auth) {
          queuePendingEngineer(pending);
          setSummaryLaunchAction(null);
          await openAuthGate(screen);
          return;
        }

        await startEngineer(pending, auth, {
          resumeTranscript: launchAction === 'resume',
        });
        setSummaryLaunchAction(null);
      })().catch((err) => {
        queuePendingEngineer(pending);
        setSummaryHasPriorTranscript(true);
        setSummaryLaunchAction(null);
        setApiKeyError(formatUnknownError(err));
      });
    },
    [
      queuePendingEngineer,
      openAuthGate,
      resolveAuthForUse,
      screen,
      startEngineer,
      takePendingEngineer,
    ],
  );

  const handleSummaryResume = useCallback(
    (): boolean | void => handleSummaryLaunch('resume'),
    [handleSummaryLaunch],
  );

  const handleSummaryStartFresh = useCallback(
    (): boolean | void => handleSummaryLaunch('fresh'),
    [handleSummaryLaunch],
  );

  const globalBindings = useMemo<Keybinding[]>(
    () => [
      {
        action: 'global.back' as const,
        context: 'global' as const,
        key: { escape: true },
        run: () => {
          if (screen.name === 'engineer' || screen.name === 'chatGptAuth') {
            return false;
          }
          handleGlobalBack();
        },
      },
      {
        action: 'global.back' as const,
        context: 'global' as const,
        key: { backspace: true },
        run: () => {
          if (
            screen.name === 'engineer' ||
            screen.name === 'chatGptAuth' ||
            screen.name === 'apiKey'
          ) {
            return false;
          }
          handleGlobalBack();
        },
      },
      {
        action: 'global.back' as const,
        context: 'global' as const,
        key: { input: 'b' },
        run: () => {
          if (
            screen.name === 'engineer' ||
            screen.name === 'chatGptAuth' ||
            screen.name === 'apiKey'
          ) {
            return false;
          }
          handleGlobalBack();
        },
      },
      {
        action: 'global.quit' as const,
        context: 'global' as const,
        key: { input: 'q' },
        run: () => {
          if (
            screen.name === 'engineer' ||
            screen.name === 'openaiAuth' ||
            screen.name === 'chatGptAuth' ||
            screen.name === 'apiKey'
          ) {
            return false;
          }
          process.exit(0);
        },
      },
      {
        action: 'global.quit' as const,
        context: 'global' as const,
        key: {
          ctrl: true,
          input: 'c',
          meta: false,
          shift: false,
          super: false,
        },
        run: () => {
          if (screen.name === 'engineer' || screen.name === 'chatGptAuth') {
            return false;
          }
          process.exit(0);
        },
      },
    ],
    [handleGlobalBack, screen.name],
  );

  useInput(
    (input, key, event) => {
      if (screen.name !== 'engineer') return;
      const isPlainCtrlC =
        input === 'c' &&
        key.ctrl &&
        !key.shift &&
        !key.meta &&
        !key.super;

      if (engineerLeavePromptVisible) {
        if (
          key.return ||
          input === '\r' ||
          input === '\n' ||
          input.toLowerCase() === 'y'
        ) {
          setEngineerLeavePromptVisible(false);
          clearEngineerQuitPrompt();
          handleGlobalBack();
          event.stopImmediatePropagation();
          return;
        }

        if (key.escape || input.toLowerCase() === 'n') {
          setEngineerLeavePromptVisible(false);
          clearEngineerQuitPrompt();
          event.stopImmediatePropagation();
          return;
        }

        event.stopImmediatePropagation();
        return;
      }

      if (key.escape) {
        clearEngineerQuitPrompt();
        if (selection.hasSelection()) {
          selection.clearSelection();
          event.stopImmediatePropagation();
          return;
        }

        if (isStreaming) {
          interruptEngineerTurn();
          event.stopImmediatePropagation();
          return;
        }

        setEngineerLeavePromptVisible(true);
        event.stopImmediatePropagation();
        return;
      }

      if (isPlainCtrlC && isStreaming) {
        clearEngineerQuitPrompt();
        interruptEngineerTurn();
        event.stopImmediatePropagation();
        return;
      }

      if (
        isPlainCtrlC &&
        selection.hasSelection()
      ) {
        clearEngineerQuitPrompt();
        selection.copySelection();
        event.stopImmediatePropagation();
        return;
      }

      if (isPlainCtrlC) {
        if (engineerQuitPromptVisible) {
          clearEngineerQuitPrompt();
          process.exit(0);
          return;
        }

        armEngineerQuitPrompt();
        event.stopImmediatePropagation();
        return;
      }

      if (
        input.length > 0 ||
        key.upArrow ||
        key.downArrow ||
        key.leftArrow ||
        key.rightArrow ||
        key.pageDown ||
        key.pageUp ||
        key.wheelUp ||
        key.wheelDown ||
        key.home ||
        key.end ||
        key.return ||
        key.tab ||
        key.backspace ||
        key.delete
      ) {
        clearEngineerQuitPrompt();
      }
    },
    {
      isActive: screen.name === 'engineer',
    },
  );

  useKeybindings({
    activeContexts: ['global'],
    bindings: globalBindings,
  });

  useInput((input) => {
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
        key={showGlobalChrome ? 'chrome-shell' : 'engineer-shell'}
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
              <Settings status={authStatus} onAction={handleSettingsAction} />
            )}
            {screen.name === 'openaiAuth' && (
              <OpenAIAuthPrompt
                envKeyPresent={authStatus.envKeyPresent}
                storedKeyPresent={authStatus.storedKeyPresent}
                onSelect={handleOpenAIAuthPromptSelect}
              />
            )}
            {screen.name === 'chatGptAuth' && (
              <ChatGptAuthPrompt
                onDone={handleChatGptAuthDone}
                onCancel={handleChatGptAuthCancel}
              />
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
                    const pending: PendingEngineer = {
                      year: screen.year,
                      meetings: screen.meetings,
                      meeting: screen.meeting,
                      session: screen.session,
                      dir,
                    };

                    let transcriptEvents: Awaited<
                      ReturnType<typeof loadTranscriptEvents>
                    > = [];
                    try {
                      transcriptEvents = await loadTranscriptEvents({
                        dataDir: getDataDir('f1aire'),
                        sessionKey: getTranscriptSessionKey({
                          year: screen.year,
                          meetingKey: screen.meeting.Key,
                          sessionKey: screen.session.Key,
                        }),
                      });
                    } catch {
                      transcriptEvents = [];
                    }

                    if (transcriptEvents.length > 0) {
                      queuePendingEngineer(pending);
                      setSummaryHasPriorTranscript(true);
                      setSummaryLaunchAction(null);
                      setScreen({
                        name: 'summary',
                        year: screen.year,
                        meetings: screen.meetings,
                        meeting: screen.meeting,
                        summary: summarizeFromLines(
                          fs.readFileSync(
                            path.join(dir, 'live.jsonl'),
                            'utf-8',
                          ),
                        ),
                        dir,
                      });
                      return;
                    }

                    setSummaryHasPriorTranscript(false);
                    setSummaryLaunchAction(null);

                    const auth = await resolveAuthForUse();
                    if (!auth) {
                      queuePendingEngineer(pending);
                      await openAuthGate(
                        getBackScreen(screen) ?? { name: 'season' },
                      );
                      return;
                    }
                    await startEngineer(pending, auth);
                  })().catch((err) => {
                    clearPendingEngineer();
                    setSummaryHasPriorTranscript(false);
                    setApiKeyError(formatUnknownError(err));
                    setScreen(
                      getBackScreen(screen) ?? {
                        name: 'season',
                      },
                    );
                  });
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
                idleStatus={
                  engineerQuitPromptVisible
                    ? 'Press Ctrl+C again to quit'
                    : null
                }
                leaveConfirmationOpen={engineerLeavePromptVisible}
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
              <Summary
                summary={screen.summary}
                dir={screen.dir}
                hasPriorTranscript={summaryHasPriorTranscript}
                launchAction={summaryLaunchAction}
                onResume={handleSummaryResume}
                onStartFresh={handleSummaryStartFresh}
                resumeError={apiKeyError}
              />
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
    <ThemeProvider>
      <AppStateProvider>
        <AppImpl />
      </AppStateProvider>
    </ThemeProvider>
  );
}
