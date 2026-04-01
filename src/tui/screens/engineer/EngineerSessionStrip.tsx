import React from 'react';
import { Text } from '#ink';
import { theme } from '../../theme.js';

export function EngineerSessionStrip({ label }: { label: string }) {
  return (
    <Text color={theme.subtle} wrap="truncate-end">
      {label}
    </Text>
  );
}
