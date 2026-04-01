import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput, type Key } from 'ink';

type SecretAction =
  | { type: 'append'; text: string }
  | { type: 'move'; delta: -1 | 1 }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'submit' };

function parseSecretActions(input: string, key: Key): SecretAction[] {
  if (input.length === 0) {
    if (key.return) return [{ type: 'submit' }];
    if (key.tab) return [];
    if (key.leftArrow) return [{ type: 'move', delta: -1 }];
    if (key.rightArrow) return [{ type: 'move', delta: 1 }];
    if (key.backspace) return [{ type: 'backspace' }];
    if (key.delete) return [{ type: 'delete' }];
    return [];
  }

  const actions: SecretAction[] = [];
  let buffer = '';

  const flushBuffer = () => {
    if (buffer.length > 0) {
      actions.push({ type: 'append', text: buffer });
      buffer = '';
    }
  };

  for (let index = 0; index < input.length; ) {
    if (input.startsWith('\u001b[Z', index) || input.startsWith('\u001b[1;2Z', index)) {
      flushBuffer();
      index += input.startsWith('\u001b[1;2Z', index) ? 6 : 3;
      continue;
    }

    if (input.startsWith('\u001b[3~', index)) {
      flushBuffer();
      actions.push({ type: 'delete' });
      index += 4;
      continue;
    }

    if (input.startsWith('\u001b[C', index)) {
      flushBuffer();
      actions.push({ type: 'move', delta: 1 });
      index += 3;
      continue;
    }

    if (input.startsWith('\u001b[D', index)) {
      flushBuffer();
      actions.push({ type: 'move', delta: -1 });
      index += 3;
      continue;
    }

    if (input.startsWith('\u001b[A', index) || input.startsWith('\u001b[B', index)) {
      flushBuffer();
      index += 3;
      continue;
    }

    const char = input[index];
    if (char === '\t') {
      flushBuffer();
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      flushBuffer();
      actions.push({ type: 'submit' });
      if (char === '\r' && input[index + 1] === '\n') {
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (char === '\b' || char === '\x7f') {
      flushBuffer();
      actions.push({ type: 'backspace' });
      index += 1;
      continue;
    }

    if (char === '\u001b') {
      flushBuffer();
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  flushBuffer();
  return actions;
}

function reconcileCursor(
  previousValue: string,
  nextValue: string,
  previousCursor: number,
): number {
  let prefixLength = 0;
  const prefixLimit = Math.min(previousValue.length, nextValue.length);

  while (
    prefixLength < prefixLimit &&
    previousValue[prefixLength] === nextValue[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const previousRemaining = previousValue.length - prefixLength;
  const nextRemaining = nextValue.length - prefixLength;
  const suffixLimit = Math.min(previousRemaining, nextRemaining);

  while (
    suffixLength < suffixLimit &&
    previousValue[previousValue.length - 1 - suffixLength] ===
      nextValue[nextValue.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  if (previousCursor <= prefixLength) {
    return previousCursor;
  }

  if (previousCursor >= previousValue.length - suffixLength) {
    return Math.max(
      prefixLength,
      nextValue.length - (previousValue.length - previousCursor),
    );
  }

  return prefixLength;
}

export function SecretTextInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'sk-...',
  isFocused = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  isFocused?: boolean;
}): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const [cursor, setCursor] = useState(value.length);
  const controlledValueRef = useRef(value);
  const draftRef = useRef(value);
  const cursorRef = useRef(value.length);
  const pendingRevisionRef = useRef(0);
  const pendingControlledEchoesRef = useRef<
    Array<{
      value: string;
      cursor: number;
    }>
  >([]);

  useEffect(() => {
    controlledValueRef.current = value;
    const pendingEchoes = pendingControlledEchoesRef.current;
    const acknowledgedIndex = pendingEchoes.findIndex(
      (pendingEcho) => pendingEcho.value === value,
    );

    if (acknowledgedIndex >= 0) {
      const acknowledgedEcho = pendingEchoes[acknowledgedIndex]!;
      pendingEchoes.splice(0, acknowledgedIndex + 1);
      const nextPendingEcho = pendingEchoes.at(-1);

      if (nextPendingEcho) {
        setDraft(nextPendingEcho.value);
        draftRef.current = nextPendingEcho.value;
        setCursor(nextPendingEcho.cursor);
        cursorRef.current = nextPendingEcho.cursor;
        return;
      }

      const nextCursor = Math.min(acknowledgedEcho.cursor, value.length);

      setDraft(value);
      draftRef.current = value;
      setCursor(nextCursor);
      cursorRef.current = nextCursor;
      return;
    }

    const nextCursor = Math.min(
      reconcileCursor(draftRef.current, value, cursorRef.current),
      value.length,
    );

    pendingEchoes.length = 0;
    setDraft(value);
    draftRef.current = value;
    setCursor(nextCursor);
    cursorRef.current = nextCursor;
  }, [value]);

  const syncState = (nextDraft: string, nextCursor: number) => {
    const nextRevision = pendingRevisionRef.current + 1;
    pendingRevisionRef.current = nextRevision;
    pendingControlledEchoesRef.current.push({
      value: nextDraft,
      cursor: nextCursor,
    });
    setDraft(nextDraft);
    draftRef.current = nextDraft;
    cursorRef.current = nextCursor;
    setCursor(nextCursor);
    onChange(nextDraft);

    setTimeout(() => {
      if (pendingRevisionRef.current !== nextRevision) {
        return;
      }

      const controlledValue = controlledValueRef.current;
      if (controlledValue === draftRef.current) {
        return;
      }

      const reconciledCursor = Math.min(
        reconcileCursor(draftRef.current, controlledValue, cursorRef.current),
        controlledValue.length,
      );

      pendingControlledEchoesRef.current = [];
      setDraft(controlledValue);
      draftRef.current = controlledValue;
      setCursor(reconciledCursor);
      cursorRef.current = reconciledCursor;
    }, 0);
  };

  useInput((input, key) => {
    for (const action of parseSecretActions(input, key)) {
      if (action.type === 'move') {
        const nextCursor = Math.max(
          0,
          Math.min(cursorRef.current + action.delta, draftRef.current.length),
        );
        cursorRef.current = nextCursor;
        setCursor(nextCursor);
        continue;
      }

      if (action.type === 'submit') {
        const trimmed = draftRef.current.trim();
        if (trimmed) {
          onSubmit(trimmed);
        }

        continue;
      }

      if (action.type === 'delete') {
        const nextDraft = `${draftRef.current.slice(0, cursorRef.current)}${draftRef.current.slice(cursorRef.current + 1)}`;
        syncState(nextDraft, cursorRef.current);
        continue;
      }

      if (action.type === 'backspace') {
        if (cursorRef.current === 0) {
          continue;
        }

        const nextDraft = `${draftRef.current.slice(0, cursorRef.current - 1)}${draftRef.current.slice(cursorRef.current)}`;
        syncState(nextDraft, cursorRef.current - 1);
        continue;
      }

      const nextDraft = `${draftRef.current.slice(0, cursorRef.current)}${action.text}${draftRef.current.slice(cursorRef.current)}`;
      syncState(nextDraft, cursorRef.current + action.text.length);
    }
  }, { isActive: isFocused });

  if (draft.length === 0) {
    return <Text>{isFocused ? `▌${placeholder}` : placeholder}</Text>;
  }

  if (!isFocused) {
    return <Text>{'*'.repeat(draft.length)}</Text>;
  }

  const masked = '*'.repeat(draft.length);
  return (
    <Text>
      {masked.slice(0, cursor)}
      <Text>▌</Text>
      {masked.slice(cursor)}
    </Text>
  );
}
