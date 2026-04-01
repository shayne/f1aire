import React from 'react';
import { Text } from '#ink';

export function getFooterHintText(screen: string): string {
  if (screen === 'engineer') {
    return 'enter send · shift+enter newline · TAB details · pgup/pgdn scroll/live · esc back · ctrl+c quit';
  }
  if (screen === 'apiKey') {
    return 'enter save · esc back · ctrl+c quit';
  }

  const showSettings =
    screen === 'season' ||
    screen === 'meeting' ||
    screen === 'session' ||
    screen === 'summary';

  return `enter select · ${showSettings ? 's settings · ' : ''}b/backspace/esc back · q quit`;
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
  return <Text color="ansi:blackBright">{getFooterHintText(screen)}</Text>;
}
