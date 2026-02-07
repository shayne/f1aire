import React from 'react';
import { Box, Text } from 'ink';
import { Panel } from '../components/Panel.js';
import { SelectList } from '../components/SelectList.js';
import { theme } from '../theme.js';

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
  const presentLabel = (value: boolean) => (value ? 'present' : 'absent');

  return (
    <Box flexDirection="row" gap={2}>
      <Box flexDirection="column" flexGrow={1}>
        <Text>Settings</Text>
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
      </Box>
      <Box width={38}>
        <Panel title="OpenAI">
          <Box flexDirection="column" gap={1}>
            <Text>
              <Text color={theme.muted}>Env key</Text>
              {`: ${presentLabel(status.envKeyPresent)}`}
            </Text>
            <Text>
              <Text color={theme.muted}>Stored key</Text>
              {`: ${presentLabel(status.storedKeyPresent)}`}
            </Text>
            <Text>
              <Text color={theme.muted}>In use</Text>
              {`: ${status.inUse}`}
            </Text>
            <Text color={theme.muted}>Press enter to select.</Text>
          </Box>
        </Panel>
      </Box>
    </Box>
  );
}

