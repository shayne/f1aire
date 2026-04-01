import { describe, expect, it } from 'vitest';
import { buildTranscriptRows } from './transcript-rows.js';

describe('buildTranscriptRows', () => {
  it('renders user and assistant messages into labeled transcript rows', () => {
    const rows = buildTranscriptRows({
      messages: [
        { role: 'user', content: 'How is pace?' },
        { role: 'assistant', content: 'Very strong over the last 5 laps.' },
      ],
      streamingText: '',
      isStreaming: false,
      status: null,
      messageWidth: 24,
    });

    expect(rows.map((row) => row.plainText)).toContain('You');
    expect(rows.map((row) => row.plainText)).toContain('Engineer');
    expect(rows.some((row) => row.plainText.includes('Very strong'))).toBe(
      true,
    );
  });

  it('adds a pending status block when streaming text is empty', () => {
    const rows = buildTranscriptRows({
      messages: [],
      streamingText: '',
      isStreaming: true,
      status: 'Thinking',
      messageWidth: 24,
    });

    expect(rows.some((row) => row.kind === 'pending-status')).toBe(true);
    expect(rows.some((row) => row.plainText.includes('Thinking'))).toBe(true);
  });
});
