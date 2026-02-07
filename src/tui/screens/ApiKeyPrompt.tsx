import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { Panel } from '../components/Panel.js';
import { theme } from '../theme.js';

export function ApiKeyPrompt({
  configPath,
  onSave,
  error,
}: {
  configPath: string;
  onSave: (apiKey: string) => void | Promise<void>;
  error?: string | null;
}): React.JSX.Element {
  const [input, setInput] = useState('');

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    void onSave(trimmed);
    setInput('');
  };

  return (
    <Panel title="OpenAI API Key" tone="accent" paddingY={1}>
      <Box flexDirection="column" gap={1}>
        <Text>Paste your OpenAI API key to continue.</Text>
        <Text color={theme.muted}>
          Stored (plaintext) at: {configPath}
        </Text>
        <Text color={theme.muted}>
          If <Text bold>OPENAI_API_KEY</Text> is set in your environment, it will
          be used instead.
        </Text>
        {error ? <Text color={theme.status.error}>Error: {error}</Text> : null}
        <Box>
          <Text color={theme.muted}>› </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            mask="*"
            placeholder="sk-..."
          />
        </Box>
      </Box>
    </Panel>
  );
}

