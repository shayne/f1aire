import React from 'react';
import { Text } from '#ink';
import { useTheme } from '../theme/provider.js';

export function getFooterHintText(screen: string): string {
  if (screen === 'engineer') {
    return 'enter send · shift+enter newline · tab details · pgup/pgdn scroll · esc stop/back';
  }
  if (screen === 'openaiAuth') {
    return 'enter select · esc back';
  }
  if (screen === 'chatGptAuth') {
    return 'enter retry · esc cancel';
  }
  if (screen === 'apiKey') {
    return 'enter save · esc back';
  }

  const showSettings =
    screen === 'season' ||
    screen === 'meeting' ||
    screen === 'session' ||
    screen === 'summary';

  return `enter select · ${showSettings ? 's settings · ' : ''}esc back · q quit`;
}

export function getFooterHintRowCount(screen: string, width: number): number {
  const text = getFooterHintText(screen);
  if (width <= 0 || text.length === 0) return 1;

  let rows = 1;
  let column = 0;

  for (const word of text.split(' ')) {
    let remaining = word;

    while (remaining.length > 0) {
      if (column === 0) {
        if (remaining.length <= width) {
          column = remaining.length;
          remaining = '';
        } else {
          remaining = remaining.slice(width);
          if (remaining.length > 0) {
            rows += 1;
          } else {
            column = width;
          }
        }
        continue;
      }

      const nextLength = 1 + remaining.length;
      if (column + nextLength <= width) {
        column += nextLength;
        remaining = '';
        continue;
      }

      rows += 1;
      column = 0;
    }
  }

  return rows;
}

export function FooterHints({ screen }: { screen: string }): React.JSX.Element {
  const theme = useTheme();

  return (
    <Text color={theme.chrome.subtle} dimColor>
      {getFooterHintText(screen)}
    </Text>
  );
}
