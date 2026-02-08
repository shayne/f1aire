import React from 'react';
import { Text } from 'ink';
import { theme } from '../theme.js';

export function FooterHints({ screen }: { screen: string }): React.JSX.Element {
  if (screen === 'engineer') {
    return (
      <Text color={theme.muted}>
        enter send · pgup/pgdn scroll · esc back · ctrl+c quit
      </Text>
    );
  }
  if (screen === 'apiKey') {
    return (
      <Text color={theme.muted}>
        enter save · esc back · ctrl+c quit
      </Text>
    );
  }
  const showSettings =
    screen === 'season' ||
    screen === 'meeting' ||
    screen === 'session' ||
    screen === 'summary';
  return (
    <Text color={theme.muted}>
      enter select · {showSettings ? 's settings · ' : ''}
      b/backspace/esc back · q quit
    </Text>
  );
}
