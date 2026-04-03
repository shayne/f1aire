import { useMemo } from 'react';
import { useInput } from '#ink';
import { keyMatches, type Keybinding, type KeybindingContext } from './actions.js';

const contextPriority: Record<KeybindingContext, number> = {
  global: 0,
  picker: 1,
  engineer: 2,
  transcript: 3,
  composer: 4,
};

export function useKeybindings({
  activeContexts,
  bindings,
  isActive = true,
}: {
  activeContexts: KeybindingContext[];
  bindings: Keybinding[];
  isActive?: boolean;
}): void {
  const orderedBindings = useMemo(
    () =>
      bindings
        .filter((binding) => activeContexts.includes(binding.context))
        .sort(
          (left, right) =>
            contextPriority[right.context] - contextPriority[left.context],
        ),
    [activeContexts, bindings],
  );

  useInput(
    (input, key, event) => {
      for (const binding of orderedBindings) {
        if (!keyMatches(binding.key, input, key)) continue;

        const handled = binding.run();
        if (handled === false) continue;

        event.stopImmediatePropagation();
        return;
      }
    },
    { isActive },
  );
}
