import React from 'react';
import { Text } from '#ink';
import { useTheme } from '../../theme/provider.js';

export function EngineerSessionStrip({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <Text color={theme.chrome.subtle} dimColor wrap="truncate-end">
      {label}
    </Text>
  );
}
