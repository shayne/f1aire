import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';

export function FooterHints({ screen }: { screen: string }): React.JSX.Element {
  if (screen === 'engineer') {
    return (
      <Text color={theme.muted}>
        enter send · esc back · ctrl+c quit
      </Text>
    );
  }
  return (
    <Text color={theme.muted}>
      enter select · b/backspace/esc back · q quit
    </Text>
  );
}
