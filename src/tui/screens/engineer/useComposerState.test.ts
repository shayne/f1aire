import { describe, expect, it } from 'vitest';
import { applyComposerEnter, getComposerVisibleLines } from './useComposerState.js';

describe('getComposerVisibleLines', () => {
  it('keeps only the last five lines', () => {
    expect(
      getComposerVisibleLines('line 1\nline 2\nline 3\nline 4\nline 5\nline 6'),
    ).toEqual(['line 2', 'line 3', 'line 4', 'line 5', 'line 6']);
  });
});

describe('applyComposerEnter', () => {
  it('inserts a newline at the cursor and advances the cursor', () => {
    expect(applyComposerEnter({ draft: 'pit wall', cursor: 3 })).toEqual({
      draft: 'pit\n wall',
      cursor: 4,
    });
  });
});
