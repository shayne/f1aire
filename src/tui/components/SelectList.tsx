import React from 'react';
import { MenuList } from './MenuList.js';

export type SelectListItem<V> = {
  key?: string;
  label: string;
  value: V;
};

type SelectListProps<V> = {
  items: Array<SelectListItem<V>>;
  onSelect: (item: V) => void;
  onHighlight?: (item: V) => void;
  isFocused?: boolean;
};

export function SelectList<V>({
  items,
  onSelect,
  onHighlight,
  isFocused,
}: SelectListProps<V>): React.JSX.Element {
  return (
    <MenuList
      items={items}
      onSelect={onSelect}
      onHighlight={onHighlight}
      isFocused={isFocused}
    />
  );
}
