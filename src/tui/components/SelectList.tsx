import React from 'react';
import { Box } from 'ink';
import SelectInput from 'ink-select-input';
import { theme } from '../theme.js';

export type SelectListItem<V> = {
  key?: string;
  label: string;
  value: V;
};

type SelectListProps<V> = {
  items: Array<SelectListItem<V>>;
  onSelect: (item: V) => void;
  onHighlight?: (item: V) => void;
};

export function SelectList<V>({
  items,
  onSelect,
  onHighlight,
}: SelectListProps<V>): React.JSX.Element {
  return (
    <Box borderStyle="round" borderColor={theme.border} paddingX={1} flexGrow={1}>
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(item.value as V)}
        onHighlight={onHighlight ? (item) => onHighlight(item.value as V) : undefined}
      />
    </Box>
  );
}
