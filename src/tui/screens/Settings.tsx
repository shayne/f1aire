import React from 'react';
import { Text, useTerminalSize } from '#ink';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SelectList } from '../components/SelectList.js';
import { useTheme } from '../theme/provider.js';
import type { OpenAIAuthPreference } from '../../core/config.js';

export type KeyStatus = {
  chatGptAccountEmail?: string;
  chatGptPlanType?: string;
  chatGptSignedIn?: boolean;
  envKeyPresent: boolean;
  openaiAuthPreference?: OpenAIAuthPreference;
  storedKeyPresent: boolean;
  inUse: 'chatgpt' | 'env' | 'stored' | 'none';
};

export type SettingsAction =
  | 'chatgpt'
  | 'prefer-chatgpt'
  | 'prefer-api-key'
  | 'paste'
  | 'clear-chatgpt'
  | 'clear'
  | 'back';

export function Settings({
  status,
  onAction,
}: {
  status: KeyStatus;
  onAction: (action: SettingsAction) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const { columns = 100 } = useTerminalSize();
  const presentLabel = (value: boolean) => (value ? 'present' : 'absent');
  const preference = status.openaiAuthPreference ?? 'chatgpt';
  const chatGptSignedIn = Boolean(status.chatGptSignedIn);

  return (
    <ScreenLayout
      columns={columns}
      title="Settings"
      subtitle="Manage ChatGPT sign-in and API-key fallback for engineer chat."
      primary={
        <SelectList
          items={[
            {
              label: 'Sign in with ChatGPT account',
              value: 'chatgpt' as const,
            },
            {
              label:
                preference === 'chatgpt'
                  ? 'Use ChatGPT account (recommended)'
                  : 'Use ChatGPT account',
              value: 'prefer-chatgpt' as const,
            },
            {
              label:
                preference === 'api-key'
                  ? 'Use OpenAI API key'
                  : 'Use OpenAI API key',
              value: 'prefer-api-key' as const,
            },
            { label: 'Paste OpenAI API key', value: 'paste' as const },
            {
              label: status.storedKeyPresent
                ? 'Clear stored OpenAI API key'
                : 'Clear stored OpenAI API key (none stored)',
              value: 'clear' as const,
            },
            {
              label: chatGptSignedIn
                ? 'Sign out ChatGPT account'
                : 'Sign out ChatGPT account (not signed in)',
              value: 'clear-chatgpt' as const,
            },
            { label: 'Back', value: 'back' as const },
          ]}
          onSelect={onAction}
        />
      }
      details={
        <Panel title="OpenAI auth">
          <Text>
            <Text color={theme.text.muted} dimColor>
              ChatGPT account
            </Text>
            {`: ${status.chatGptAccountEmail ?? presentLabel(chatGptSignedIn)}`}
          </Text>
          {status.chatGptPlanType ? (
            <Text>
              <Text color={theme.text.muted} dimColor>
                Plan
              </Text>
              {`: ${status.chatGptPlanType}`}
            </Text>
          ) : null}
          <Text>
            <Text color={theme.text.muted} dimColor>
              Preference
            </Text>
            {`: ${preference}`}
          </Text>
          <Text>
            <Text color={theme.text.muted} dimColor>
              Env key
            </Text>
            {`: ${presentLabel(status.envKeyPresent)}`}
          </Text>
          <Text>
            <Text color={theme.text.muted} dimColor>
              Stored key
            </Text>
            {`: ${presentLabel(status.storedKeyPresent)}`}
          </Text>
          <Text>
            <Text color={theme.text.muted} dimColor>
              In use
            </Text>
            {`: ${status.inUse}`}
          </Text>
          {status.inUse === 'none' ? (
            <Text color={theme.text.muted} dimColor>
              Sign in with ChatGPT or paste an OpenAI API key before opening
              the engineer.
            </Text>
          ) : null}
        </Panel>
      }
    />
  );
}
