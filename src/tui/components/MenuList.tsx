import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useInput, type Key } from '#ink';
import { theme } from '../theme.js';

const menuAccentColor = theme.accent;

type MenuAction =
  | { type: 'move'; delta: -1 | 1 }
  | { type: 'submit' }
  | { type: 'select'; index: number };

function parseMenuActions(input: string, key: Key): MenuAction[] {
  if (key.upArrow) return [{ type: 'move', delta: -1 }];
  if (key.downArrow) return [{ type: 'move', delta: 1 }];
  if (key.return) return [{ type: 'submit' }];
  if (input.length === 0) return [];

  const actions: MenuAction[] = [];
  for (let index = 0; index < input.length; ) {
    if (input.startsWith('\u001b[A', index)) {
      actions.push({ type: 'move', delta: -1 });
      index += 3;
      continue;
    }

    if (input.startsWith('\u001b[B', index)) {
      actions.push({ type: 'move', delta: 1 });
      index += 3;
      continue;
    }

    const char = input[index];
    if (char === 'k') {
      actions.push({ type: 'move', delta: -1 });
      index += 1;
      continue;
    }

    if (char === 'j') {
      actions.push({ type: 'move', delta: 1 });
      index += 1;
      continue;
    }

    if (char >= '1' && char <= '9') {
      actions.push({ type: 'select', index: Number(char) - 1 });
      index += 1;
      continue;
    }

    if (char === '\r' || char === '\n') {
      actions.push({ type: 'submit' });
      if (char === '\r' && input[index + 1] === '\n') {
        index += 2;
        continue;
      }
    }

    index += 1;
  }

  return actions;
}

export function MenuList<V>({
  items,
  onSelect,
  onHighlight,
  isFocused = true,
}: {
  items: Array<{ key?: string; label: string; value: V }>;
  onSelect: (item: V) => void;
  onHighlight?: (item: V) => void;
  isFocused?: boolean;
}): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);

  useEffect(() => {
    const maxIndex = Math.max(items.length - 1, 0);
    const nextIndex = Math.min(indexRef.current, maxIndex);
    indexRef.current = nextIndex;
    setIndex(nextIndex);
  }, [items]);

  const moveHighlight = (delta: -1 | 1) => {
    const next = (indexRef.current + delta + items.length) % items.length;
    indexRef.current = next;
    setIndex(next);
    onHighlight?.(items[next]!.value);
  };

  const submitCurrent = () => {
    const current = items[indexRef.current];
    if (current) {
      onSelect(current.value);
    }
  };

  useInput((input, key) => {
    if (items.length === 0) {
      return;
    }

    for (const action of parseMenuActions(input, key)) {
      if (action.type === 'move') {
        moveHighlight(action.delta);
        continue;
      }

      if (action.type === 'select') {
        if (action.index >= items.length) {
          continue;
        }

        const next = action.index;
        indexRef.current = next;
        setIndex(next);
        onHighlight?.(items[next]!.value);
        onSelect(items[next]!.value);
        continue;
      }

      submitCurrent();
    }
  }, { isActive: isFocused });

  return (
    <Box flexDirection="column">
      {items.map((item, itemIndex) => (
        <Text
          key={item.key ?? item.label}
          color={itemIndex === index ? menuAccentColor : theme.subtle}
          dimColor={itemIndex !== index}
        >
          {itemIndex === index ? '› ' : '  '}
          {item.label}
        </Text>
      ))}
    </Box>
  );
}
