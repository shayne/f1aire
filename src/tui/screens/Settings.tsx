import React from 'react';
import { Text, useTerminalSize } from '#ink';
import { Panel } from '../components/Panel.js';
import { ScreenLayout } from '../components/ScreenLayout.js';
import { SelectList } from '../components/SelectList.js';
import { useTheme } from '../theme/provider.js';

export type KeyStatus = {
  envKeyPresent: boolean;
  storedKeyPresent: boolean;
  inUse: 'env' | 'stored' | 'none';
};

export type SettingsAction = 'paste' | 'clear' | 'back';

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

  return (
    <ScreenLayout
      columns={columns}
      title="Settings"
      subtitle="Manage the OpenAI key f1aire uses for engineer chat."
      primary={
        <SelectList
          items={[
            { label: 'Paste OpenAI API key', value: 'paste' as const },
            {
              label: status.storedKeyPresent
                ? 'Clear stored OpenAI API key'
                : 'Clear stored OpenAI API key (none stored)',
              value: 'clear' as const,
            },
            { label: 'Back', value: 'back' as const },
          ]}
          onSelect={onAction}
        />
      }
      details={
        <Panel title="OpenAI key">
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
              Paste a key here or export OPENAI_API_KEY before opening the
              engineer.
            </Text>
          ) : null}
        </Panel>
      }
    />
  );
}
