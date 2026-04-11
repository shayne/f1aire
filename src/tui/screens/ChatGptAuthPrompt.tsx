import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, useTerminalSize } from '#ink';
import type { OpenAIChatGptAuthConfig } from '../../core/config.js';
import { startChatGptOpenAIAuth } from '../../core/openai-auth.js';
import { setClipboard } from '../../vendor/ink/termio/osc.js';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { createTerminalLink } from '../terminal-chrome.js';
import { useTheme } from '../theme/provider.js';

type ChatGptAuthAttempt = {
  authUrl: string;
  cancel: () => Promise<void>;
  waitForCompletion: () => Promise<OpenAIChatGptAuthConfig>;
};

export function ChatGptAuthPrompt({
  onDone,
  onCancel,
}: {
  onDone: (auth: OpenAIChatGptAuthConfig) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const attemptRef = useRef<ChatGptAuthAttempt | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelDeliveredRef = useRef(false);
  const cancelRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('Opening your browser...');
  const [error, setError] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  const startAttempt = () => {
    cancelDeliveredRef.current = false;
    setError(null);
    setStatus('Opening your browser...');

    void (async () => {
      try {
        const attempt = await startChatGptOpenAIAuth({ appName: 'f1aire' });
        if (!mountedRef.current) {
          await attempt.cancel().catch(() => {});
          return;
        }

        if (cancelRequestedRef.current) {
          await attempt.cancel().catch(() => {});
          attemptRef.current = null;
          if (!cancelDeliveredRef.current) {
            cancelDeliveredRef.current = true;
            onCancel();
          }
          return;
        }

        attemptRef.current = attempt;
        setAuthUrl(attempt.authUrl);
        setStatus('Waiting for browser sign-in...');

        const auth = await attempt.waitForCompletion();
        if (!mountedRef.current) {
          return;
        }

        setStatus('Signed in with ChatGPT.');
        setError(null);
        onDone(auth);
      } catch (err) {
        if (!mountedRef.current) {
          return;
        }
        setStatus('ChatGPT sign-in failed.');
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mountedRef.current) {
          attemptRef.current = null;
        }
      }
    })();
  };

  useEffect(() => {
    mountedRef.current = true;
    startAttempt();

    return () => {
      mountedRef.current = false;
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
      void attemptRef.current?.cancel().catch(() => {});
      attemptRef.current = null;
    };
  }, []);

  useInput(
    (input, key, event) => {
      if (input === 'c' && authUrl) {
        event.stopImmediatePropagation();
        void setClipboard(authUrl).then((raw) => {
          if (!mountedRef.current) {
            return;
          }

          if (raw) {
            process.stdout.write(raw);
          }

          setUrlCopied(true);
          if (copyResetTimerRef.current) {
            clearTimeout(copyResetTimerRef.current);
          }
          copyResetTimerRef.current = setTimeout(() => {
            copyResetTimerRef.current = null;
            if (mountedRef.current) {
              setUrlCopied(false);
            }
          }, 2000);
        });
        return;
      }

      if (key.escape) {
        event.stopImmediatePropagation();
        cancelRequestedRef.current = true;
        const attempt = attemptRef.current;
        attemptRef.current = null;
        void (async () => {
          await attempt?.cancel().catch(() => {});
          if (!mountedRef.current) {
            return;
          }
          if (!cancelDeliveredRef.current) {
            cancelDeliveredRef.current = true;
            onCancel();
          }
        })();
        return;
      }

      if (
        error &&
        (key.return || input === '\r' || input === '\n' || input === 'r')
      ) {
        event.stopImmediatePropagation();
        cancelRequestedRef.current = false;
        startAttempt();
      }
    },
    { isActive: true },
  );

  return (
    <ScreenLayout
      columns={columns}
      title="ChatGPT sign-in"
      subtitle="Authorize f1aire in your browser with your ChatGPT account."
      primary={
        <Panel title="Browser OAuth" tone={error ? 'danger' : 'accent'}>
          <Box flexDirection="column" gap={1}>
            <Text color={error ? theme.status.error : theme.text.primary}>
              {status}
            </Text>
            {error ? (
              <Text color={theme.text.muted} dimColor>
                Error: {error}
              </Text>
            ) : null}
            <Text color={theme.text.muted} dimColor>
              {urlCopied
                ? 'Copied URL to clipboard.'
                : error
                  ? 'Enter retry · c copy URL · Esc back'
                  : 'c copy URL · Esc cancel'}
            </Text>
          </Box>
        </Panel>
      }
      details={
        <Panel title="Continue in your browser">
          <Text color={theme.text.primary}>
            If the browser did not open automatically, copy this URL:
          </Text>
          <Text color={theme.text.muted} dimColor>
            {createTerminalLink(authUrl ?? 'Waiting for auth URL...')}
          </Text>
        </Panel>
      }
    />
  );
}
