import { describe, expect, it } from 'vitest';
import { buildTranscriptRows } from './transcript-rows.js';

describe('buildTranscriptRows', () => {
  it('adds an onboarding note when the conversation is empty and idle', () => {
    const rows = buildTranscriptRows({
      messages: [],
      streamingText: '',
      isStreaming: false,
      status: null,
      messageWidth: 48,
    });

    expect(
      rows.some((row) =>
        row.plainText.includes('Ask about pace, tyres, pit windows, or traffic.'),
      ),
    ).toBe(true);
  });

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

    expect(
      rows.some((row) => row.kind === 'label' && row.plainText === 'You'),
    ).toBe(true);
    expect(
      rows.some((row) => row.kind === 'label' && row.plainText === 'Engineer'),
    ).toBe(true);
    expect(rows.some((row) => row.plainText.includes('Very strong'))).toBe(
      true,
    );
    expect(
      rows.some((row) => row.kind === 'spacer' && row.plainText === ''),
    ).toBe(true);
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

  it('renders live assistant streaming text into transcript rows', () => {
    const rows = buildTranscriptRows({
      messages: [],
      streamingText: 'Pit wall says the pace is strong.',
      isStreaming: true,
      status: 'Thinking',
      messageWidth: 24,
    });

    expect(
      rows.some((row) => row.kind === 'label' && row.plainText === 'Engineer'),
    ).toBe(true);
    expect(
      rows.some(
        (row) =>
          row.kind === 'message-line' &&
          row.plainText.includes('Pit wall says'),
      ),
    ).toBe(true);
    expect(rows.some((row) => row.kind === 'pending-status')).toBe(false);
  });
});
