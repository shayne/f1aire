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

describe('EngineerChat details toggle', () => {
  it('keeps plain i typing in the composer and toggles details with Tab', async () => {
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={44}
        pythonCode={'import numpy as np\nprint("hi")\n2+2'}
      />,
    );

    await tick();
    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Python');

    stdin.write('i');
    await tick();

    const typedFrame = stripAnsi(lastFrame() ?? '');
    expect(typedFrame).toContain('› i');
    expect(typedFrame).not.toContain('Python');

    stdin.write('\t');
    await tick();

    const expandedFrame = stripAnsi(lastFrame() ?? '');
    expect(expandedFrame).toContain('print("hi")');

    stdin.write('\t');
    await tick();

    const collapsedFrame = stripAnsi(lastFrame() ?? '');
    expect(collapsedFrame).not.toContain('Python');
    unmount();
  });
});
