import { useCallback, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Key } from 'ink';

export const COMPOSER_VISIBLE_LINE_CAP = 5;

export type ComposerState = {
  draft: string;
  cursor: number;
  visibleLines: string[];
  setDraft: Dispatch<SetStateAction<string>>;
  setCursor: Dispatch<SetStateAction<number>>;
  handleInput: (input: string, key: Key) => void;
  submit: () => void;
};

export type ComposerEnterResult = {
  draft: string;
  cursor: number;
  shouldSubmit: boolean;
};

function clampCursor(draft: string, cursor: number): number {
  return Math.max(0, Math.min(cursor, draft.length));
}

function insertText(
  draft: string,
  cursor: number,
  text: string,
): { draft: string; cursor: number } {
  const safeCursor = clampCursor(draft, cursor);
  const nextDraft = `${draft.slice(0, safeCursor)}${text}${draft.slice(
    safeCursor,
  )}`;
  return {
    draft: nextDraft,
    cursor: safeCursor + text.length,
  };
}

function removeTextBeforeCursor(
  draft: string,
  cursor: number,
): { draft: string; cursor: number } {
  const safeCursor = clampCursor(draft, cursor);
  if (safeCursor <= 0) return { draft, cursor: 0 };
  return {
    draft: `${draft.slice(0, safeCursor - 1)}${draft.slice(safeCursor)}`,
    cursor: safeCursor - 1,
  };
}

function removeTextAtCursor(
  draft: string,
  cursor: number,
): { draft: string; cursor: number } {
  const safeCursor = clampCursor(draft, cursor);
  if (safeCursor >= draft.length) return { draft, cursor: safeCursor };
  return {
    draft: `${draft.slice(0, safeCursor)}${draft.slice(safeCursor + 1)}`,
    cursor: safeCursor,
  };
}

function wrapComposerLine(line: string, width: number): string[] {
  if (width <= 0) return [line];
  if (line.length === 0) return [''];
  const segments: string[] = [];
  for (let i = 0; i < line.length; i += width) {
    segments.push(line.slice(i, i + width));
  }
  return segments;
}

export function applyComposerEnter({
  draft,
  cursor,
  shift,
}: {
  draft: string;
  cursor: number;
  shift: boolean;
}): ComposerEnterResult {
  if (!shift) {
    return {
      draft,
      cursor,
      shouldSubmit: true,
    };
  }

  const next = insertText(draft, cursor, '\n');
  return {
    ...next,
    shouldSubmit: false,
  };
}

export function getComposerVisibleLines(
  draft: string,
  width: number,
): string[] {
  const lines = draft
    .split('\n')
    .flatMap((line) => wrapComposerLine(line, width));
  if (lines.length <= COMPOSER_VISIBLE_LINE_CAP) return lines;
  return lines.slice(-COMPOSER_VISIBLE_LINE_CAP);
}

export function useComposerState({
  onSend,
  isStreaming,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
}): ComposerState {
  const [draft, setDraft] = useState('');
  const [cursor, setCursor] = useState(0);

  const submit = useCallback(() => {
    if (isStreaming) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setDraft('');
    setCursor(0);
  }, [draft, isStreaming, onSend]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (key.ctrl && input === 'c') return;

      if (key.return) {
        const next = applyComposerEnter({
          draft,
          cursor,
          shift: key.shift,
        });
        if (next.shouldSubmit) {
          submit();
          return;
        }
        setDraft(next.draft);
        setCursor(next.cursor);
        return;
      }

      if (key.backspace) {
        setDraft((currentDraft) => {
          const next = removeTextBeforeCursor(currentDraft, cursor);
          setCursor(next.cursor);
          return next.draft;
        });
        return;
      }

      if (key.delete) {
        setDraft((currentDraft) => {
          const next = removeTextAtCursor(currentDraft, cursor);
          setCursor(next.cursor);
          return next.draft;
        });
        return;
      }

      if (key.leftArrow) {
        setCursor((currentCursor) => Math.max(currentCursor - 1, 0));
        return;
      }

      if (key.rightArrow) {
        setCursor((currentCursor) => Math.min(currentCursor + 1, draft.length));
        return;
      }

      if (input.length > 0) {
        setDraft((currentDraft) => {
          const next = insertText(currentDraft, cursor, input);
          setCursor(next.cursor);
          return next.draft;
        });
      }
    },
    [cursor, draft, submit],
  );

  const visibleLines = useMemo(
    () => getComposerVisibleLines(draft, 48),
    [draft],
  );

  return {
    draft,
    cursor,
    visibleLines,
    setDraft,
    setCursor,
    handleInput,
    submit,
  };
}
