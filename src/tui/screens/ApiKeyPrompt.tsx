import React, { useState } from 'react';
import { Box, Text, useTerminalSize } from '#ink';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SecretTextInput } from '../components/SecretTextInput.js';
import { createTerminalLink } from '../terminal-chrome.js';
import { useTheme } from '../theme/provider.js';

export function ApiKeyPrompt({
  configPath,
  onSave,
  error,
}: {
  configPath: string;
  onSave: (apiKey: string) => void | Promise<void>;
  error?: string | null;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void onSave(trimmed);
    setInput('');
  };

  return (
    <ScreenLayout
      columns={columns}
      title="OpenAI API key"
      subtitle="Paste a key so f1aire can start the race engineer."
      primary={
        <Panel title="Paste a valid key" tone="accent" paddingY={1}>
          <Box flexDirection="column" gap={1}>
            <Text color={theme.text.primary}>
              Use a project or user API key to continue.
            </Text>
            {error ? (
              <Text color={theme.status.error}>Error: {error}</Text>
            ) : null}
            <Box>
              <Text color={theme.text.muted} dimColor>
                ›{' '}
              </Text>
              <SecretTextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="sk-..."
              />
            </Box>
          </Box>
        </Panel>
      }
      details={
        <Panel title="Storage">
          <Text color={theme.text.muted} dimColor>
            OPENAI_API_KEY in the shell overrides this saved key.
          </Text>
          <Text color={theme.text.muted} dimColor>
            Stored plaintext at:
          </Text>
          <Text>{createTerminalLink(configPath)}</Text>
        </Panel>
      }
    />
  );
}
