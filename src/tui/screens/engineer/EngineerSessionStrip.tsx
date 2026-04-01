import React from 'react';
import { Text } from '#ink';

export function EngineerSessionStrip({ label }: { label: string }) {
  return (
    <Text color="ansi:blackBright" wrap="truncate-end">
      {label}
    </Text>
  );
}
