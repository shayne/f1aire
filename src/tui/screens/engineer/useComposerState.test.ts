import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyComposerEnter,
  getComposerVisibleLines,
  useComposerState,
} from './useComposerState.js';

const waitForTick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

function Harness({
  onSend,
  isStreaming = false,
  onState,
}: {
  onSend: (text: string) => void;
  isStreaming?: boolean;
  onState?: (state: ReturnType<typeof useComposerState>) => void;
}) {
  const state = useComposerState({ onSend, isStreaming });
  onState?.(state);
  return null;
}

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
    expect(applyComposerEnter({ draft: 'pit wall', cursor: 3 }, false)).toEqual(
      {
        draft: 'pit wall',
        cursor: 3,
        shouldSubmit: true,
      },
    );
  });

  it('inserts a newline on Shift+Enter and advances the cursor', () => {
    expect(applyComposerEnter({ draft: 'pit wall', cursor: 3 }, true)).toEqual({
      draft: 'pit\n wall',
      cursor: 4,
      shouldSubmit: false,
    });
  });
});

describe('useComposerState', () => {
  it('handles Shift+Enter through the composer handler', async () => {
    let state: ReturnType<typeof useComposerState> | null = null;
    render(
      React.createElement(Harness, {
        onSend: vi.fn(),
        onState: (nextState: ReturnType<typeof useComposerState>) => {
          state = nextState;
        },
      }),
    );

    await waitForTick();
    state?.handleInput('ab', {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      return: false,
      escape: false,
      ctrl: false,
      shift: false,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
    });
    await waitForTick();
    state?.handleInput('', {
      upArrow: false,
      downArrow: false,
      leftArrow: false,
      rightArrow: false,
      pageDown: false,
      pageUp: false,
      return: true,
      escape: false,
      ctrl: false,
      shift: true,
      tab: false,
      backspace: false,
      delete: false,
      meta: false,
    });

    await waitForTick();
    expect(state?.draft).toBe('ab\n');
    expect(state?.cursor).toBe(3);
  });
});
