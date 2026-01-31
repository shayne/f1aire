import React from 'react';
import { Box } from 'ink';
import SelectInput, { type Item } from 'ink-select-input';

export type SelectListItem<V> = Item<V>;

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
    <Box borderStyle="single" paddingX={1} flexGrow={1}>
      <SelectInput
        items={items}
        onSelect={(item) => onSelect(item.value)}
        onHighlight={onHighlight ? (item) => onHighlight(item.value) : undefined}
      />
    </Box>
  );
}
