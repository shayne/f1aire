import { describe, expect, it } from 'vitest';
import { getVirtualTranscriptWindow } from './useVirtualTranscriptRows.js';

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    kind: 'message' as const,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    lines: [`row ${index}`],
  }));
}

describe('getVirtualTranscriptWindow', () => {
  it('returns a bounded slice plus top and bottom spacer counts', () => {
    const window = getVirtualTranscriptWindow({
      rows: rows(200),
      viewportRows: 12,
      scrollOffset: 30,
      overscan: 4,
    });

    expect(window.visibleRows[0]?.id).toBe('row-26');
    expect(window.visibleRows.at(-1)?.id).toBe('row-45');
    expect(window.topSpacerRows).toBe(26);
    expect(window.bottomSpacerRows).toBe(154);
  });

  it('clamps overscrolled offsets so spacer counts stay within transcript bounds', () => {
    const window = getVirtualTranscriptWindow({
      rows: rows(3),
      viewportRows: 5,
      scrollOffset: 100,
      overscan: 2,
    });

    expect(window.visibleRows.map((row) => row.id)).toEqual([
      'row-1',
      'row-2',
    ]);
    expect(window.topSpacerRows).toBe(1);
    expect(window.bottomSpacerRows).toBe(0);
  });
});
