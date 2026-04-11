import React from 'react';
import { Text, useTerminalSize } from '#ink';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SelectList } from '../components/SelectList.js';
import { useTheme } from '../theme/provider.js';

export type OpenAIAuthPromptAction = 'chatgpt' | 'api-key' | 'back';

export function OpenAIAuthPrompt({
  onSelect,
  envKeyPresent,
  storedKeyPresent,
}: {
  onSelect: (action: OpenAIAuthPromptAction) => void;
  envKeyPresent: boolean;
  storedKeyPresent: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();

  return (
    <ScreenLayout
      columns={columns}
      title="OpenAI auth"
      subtitle="Sign in with ChatGPT or explicitly choose an API key."
      primary={
        <SelectList
          items={[
            {
              label: 'Use ChatGPT account (recommended)',
              value: 'chatgpt' as const,
            },
            {
              label: 'Use OpenAI API key',
              value: 'api-key' as const,
            },
            {
              label: 'Back',
              value: 'back' as const,
            },
          ]}
          onSelect={onSelect}
        />
      }
      details={
        <Panel title="Sign in with ChatGPT">
          <Text color={theme.text.primary}>
            ChatGPT OAuth is preferred so the engineer can use your signed-in
            account instead of a standalone key.
          </Text>
          {envKeyPresent ? (
            <Text color={theme.text.muted} dimColor>
              OPENAI_API_KEY detected. Choose API key here if you want to use
              it instead.
            </Text>
          ) : storedKeyPresent ? (
            <Text color={theme.text.muted} dimColor>
              A stored API key is available as an explicit fallback.
            </Text>
          ) : (
            <Text color={theme.text.muted} dimColor>
              You can still paste an API key if you prefer usage-based billing.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
