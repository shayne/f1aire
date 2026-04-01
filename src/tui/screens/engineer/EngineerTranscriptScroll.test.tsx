import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
import { EngineerChat } from '../EngineerChat.js';

const baseProps = {
  messages: [] as { role: 'user' | 'assistant'; content: string }[],
  onSend: vi.fn(),
  streamingText: '',
  isStreaming: false,
  status: null as string | null,
  year: 2025,
  meeting: {
    Key: 1,
    Name: 'Test GP',
    Location: 'Nowhere',
    Sessions: [],
  },
  session: {
    Key: 10,
    Name: 'Race',
    Type: 'Race',
    StartDate: '2025-01-01T00:00:00Z',
    EndDate: '2025-01-01T02:00:00Z',
    GmtOffset: '+00:00',
  },
  summary: null,
  activity: [] as string[],
};

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message ${index + 1}`,
  }));
}

describe('EngineerChat transcript scroll', () => {
  it('shows a jump-to-latest affordance after PageUp and clears it after PageDown', async () => {
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat {...baseProps} maxHeight={14} messages={makeMessages(20)} />,
    );

    await tick();

    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Jump to bottom');

    stdin.write('\u001b[5~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain('Jump to bottom');

    stdin.write('\u001b[6~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Jump to bottom');
    unmount();
  });
});
