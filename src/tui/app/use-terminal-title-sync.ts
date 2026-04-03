import { useEffect } from 'react';
import type { Screen } from '../navigation.js';
import {
  buildTerminalTitle,
  writeTerminalTitle,
} from '../terminal-chrome.js';

export function useTerminalTitleSync({
  screenName,
  isStreaming,
  summaryTitle,
  writeTitle = writeTerminalTitle,
}: {
  screenName: Screen['name'];
  isStreaming: boolean;
  summaryTitle?: string | null;
  writeTitle?: (title: string) => void;
}): void {
  useEffect(() => {
    writeTitle(
      buildTerminalTitle({
        screenName,
        breadcrumb: summaryTitle ? [summaryTitle] : [],
        isStreaming,
      }),
    );
  }, [isStreaming, screenName, summaryTitle, writeTitle]);
}
