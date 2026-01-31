import React from 'react';
import { Text } from 'ink';

export function FooterHints(): React.JSX.Element {
  return (
    <Text color="gray">
      Enter: select | b/backspace/esc: back | q: quit
    </Text>
  );
}
