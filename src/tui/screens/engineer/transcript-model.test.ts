import { describe, expect, it } from 'vitest';
import type { TranscriptEvent } from '../../../agent/transcript-events.js';
import { buildTranscriptModel } from './transcript-model.js';

describe('buildTranscriptModel', () => {
  it('preserves tool lifecycle and streaming assistant text as first-class rows', () => {
    const events: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Compare Verstappen and Norris race pace.',
      },
      {
        id: 'tool-1',
        type: 'tool-call',
        toolName: 'compare_lap_times',
        label: 'Comparing lap time deltas',
      },
      {
        id: 'tool-1-result',
        type: 'tool-result',
        toolName: 'compare_lap_times',
        label: 'Lap comparison ready',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Verstappen’s median pace was 0.18s stronger on the medium stint.',
        streaming: false,
      },
    ];

    const model = buildTranscriptModel({ events, messageWidth: 72 });

    expect(model.rows.map((row) => row.kind)).toEqual([
      'message',
      'tool',
      'tool',
      'message',
    ]);
    expect(model.rows[1]).toMatchObject({
      id: 'tool-1',
      role: 'tool',
      label: 'Comparing lap time deltas',
    });
    expect(model.version).toContain('tool-1-result');
  });
});
