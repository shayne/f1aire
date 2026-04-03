import type { Key } from '#ink';

export type KeybindingContext =
  | 'global'
  | 'picker'
  | 'engineer'
  | 'composer'
  | 'transcript';

export type KeyActionId =
  | 'global.back'
  | 'global.quit'
  | 'picker.moveUp'
  | 'picker.moveDown'
  | 'picker.select'
  | 'engineer.toggleDetails'
  | 'transcript.pageUp'
  | 'transcript.pageDown'
  | 'transcript.wheelUp'
  | 'transcript.wheelDown'
  | 'transcript.jumpToLatest'
  | 'composer.submit';

export type Keybinding = {
  action: KeyActionId;
  context: KeybindingContext;
  key: Partial<Key> & { input?: string };
  run: () => boolean | void;
};

export function keyMatches(
  bindingKey: Keybinding['key'],
  input: string,
  key: Key,
): boolean {
  if (
    bindingKey.input !== undefined &&
    bindingKey.input !== input
  ) {
    return false;
  }

  for (const [name, expected] of Object.entries(bindingKey)) {
    if (name === 'input' || expected === undefined) continue;
    if (key[name as keyof Key] !== expected) return false;
  }

  return true;
}
