import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Key } from '#ink';

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

type ParsedComposerInput =
  | { type: 'insert'; text: string }
  | { type: 'submit' }
  | { type: 'newline' };

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

function moveCursor(draft: string, cursor: number, delta: number): number {
  return Math.max(0, Math.min(cursor + delta, draft.length));
}

type ComposerDraftState = { draft: string; cursor: number };

type ComposerAction =
  | { type: 'insert'; text: string }
  | { type: 'backspace' }
  | { type: 'move'; delta: number }
  | { type: 'set-draft'; draft: string }
  | { type: 'set-cursor'; cursor: number }
  | { type: 'reset' };

function applyComposerAction(
  state: ComposerDraftState,
  action: ComposerAction,
): ComposerDraftState {
  switch (action.type) {
    case 'insert':
      return insertText(state.draft, state.cursor, action.text);
    case 'backspace':
      return removeTextBeforeCursor(state.draft, state.cursor);
    case 'move':
      return {
        draft: state.draft,
        cursor: moveCursor(state.draft, state.cursor, action.delta),
      };
    case 'set-draft':
      return {
        draft: action.draft,
        cursor: clampCursor(action.draft, state.cursor),
      };
    case 'set-cursor':
      return {
        draft: state.draft,
        cursor: clampCursor(state.draft, action.cursor),
      };
    case 'reset':
      return { draft: '', cursor: 0 };
    default:
      return state;
  }
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

export function applyComposerEnter(
  {
    draft,
    cursor,
  }: {
    draft: string;
    cursor: number;
  },
  shift: boolean,
): ComposerEnterResult {
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

function parseComposerInput(input: string): ParsedComposerInput[] {
  const actions: ParsedComposerInput[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer.length === 0) return;
    actions.push({ type: 'insert', text: buffer });
    buffer = '';
  };

  for (let index = 0; index < input.length; ) {
    if (
      input.startsWith('\u001b[13;2u', index) ||
      input.startsWith('\u001b[13;2~', index) ||
      input.startsWith('[13;2u', index)
    ) {
      flushBuffer();
      actions.push({ type: 'newline' });
      index += input.startsWith('[13;2u', index) ? 6 : 8;
      continue;
    }

    const char = input[index];
    if (char === '\r' || char === '\n') {
      flushBuffer();
      actions.push({ type: 'submit' });
      if (char === '\r' && input[index + 1] === '\n') {
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    buffer += char;
    index += 1;
  }

  flushBuffer();
  return actions;
}

export function useComposerState({
  onSend,
  isStreaming,
}: {
  onSend: (text: string) => void;
  isStreaming: boolean;
}): ComposerState {
  const [state, dispatch] = useReducer(applyComposerAction, {
    draft: '',
    cursor: 0,
  });
  const stateRef = useRef(state);

  const commit = useCallback((action: ComposerAction) => {
    stateRef.current = applyComposerAction(stateRef.current, action);
    dispatch(action);
  }, []);

  const submit = useCallback(() => {
    if (isStreaming) return;
    const trimmed = stateRef.current.draft.trim();
    if (!trimmed) return;
    onSend(trimmed);
    commit({ type: 'reset' });
  }, [commit, isStreaming, onSend]);

  const handleInput = useCallback(
    (input: string, key: Key) => {
      if (key.ctrl && input === 'c') return;

      if (key.return) {
        const next = applyComposerEnter(stateRef.current, key.shift);
        if (next.shouldSubmit) {
          submit();
          return;
        }
        commit({ type: 'insert', text: '\n' });
        return;
      }

      if (input.length > 0) {
        for (const action of parseComposerInput(input)) {
          if (action.type === 'insert') {
            commit({ type: 'insert', text: action.text });
            continue;
          }

          if (action.type === 'newline') {
            commit({ type: 'insert', text: '\n' });
            continue;
          }

          submit();
        }
        return;
      }

      if (key.backspace || key.delete) {
        commit({ type: 'backspace' });
        return;
      }

      if (key.leftArrow) {
        commit({ type: 'move', delta: -1 });
        return;
      }

      if (key.rightArrow) {
        commit({ type: 'move', delta: 1 });
        return;
      }
    },
    [commit, submit],
  );

  const visibleLines = useMemo(
    () => getComposerVisibleLines(state.draft, 48),
    [state.draft],
  );

  const setDraft = useCallback<Dispatch<SetStateAction<string>>>(
    (value) => {
      if (typeof value === 'function') {
        const nextDraft = value(stateRef.current.draft);
        commit({ type: 'set-draft', draft: nextDraft });
        return;
      }
      commit({ type: 'set-draft', draft: value });
    },
    [commit],
  );

  const setCursor = useCallback<Dispatch<SetStateAction<number>>>(
    (value) => {
      if (typeof value === 'function') {
        const nextCursor = value(stateRef.current.cursor);
        commit({ type: 'set-cursor', cursor: nextCursor });
        return;
      }
      commit({ type: 'set-cursor', cursor: value });
    },
    [commit],
  );

  return {
    draft: state.draft,
    cursor: state.cursor,
    visibleLines,
    setDraft,
    setCursor,
    handleInput,
    submit,
  };
}
