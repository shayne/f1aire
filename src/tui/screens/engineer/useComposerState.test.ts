import { describe, expect, it } from 'vitest';
import {
  applyComposerEnter,
  getComposerVisibleLines,
} from './useComposerState.js';

describe('getComposerVisibleLines', () => {
  it('wraps long lines by width', () => {
    expect(getComposerVisibleLines('abcdefghi', 3)).toEqual([
      'abc',
      'def',
      'ghi',
    ]);
  });

  it('keeps only the last five visible wrapped lines', () => {
    expect(getComposerVisibleLines('abcdefghijklmnopqr', 3)).toEqual([
      'def',
      'ghi',
      'jkl',
      'mno',
      'pqr',
    ]);
  });
});

describe('applyComposerEnter', () => {
  it('submits on plain Enter without mutating the draft', () => {
    expect(
      applyComposerEnter({ draft: 'pit wall', cursor: 3, shift: false }),
    ).toEqual({
      draft: 'pit wall',
      cursor: 3,
      shouldSubmit: true,
    });
  });

  it('inserts a newline on Shift+Enter and advances the cursor', () => {
    expect(
      applyComposerEnter({ draft: 'pit wall', cursor: 3, shift: true }),
    ).toEqual({
      draft: 'pit\n wall',
      cursor: 4,
      shouldSubmit: false,
    });
  });
});
