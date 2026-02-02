import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';
import { EngineerChat } from './EngineerChat.js';

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

describe('EngineerChat', () => {
  it('renders assistant markdown without literal markers', () => {
    const { lastFrame } = render(
      <EngineerChat
        {...baseProps}
        messages={[
          {
            role: 'assistant',
            content: 'Here is **bold** and `code`.\n- item one',
          },
        ]}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toMatch(/Here is\s+bold\s+and\s+code\./);
    expect(frame).not.toContain('**bold**');
    expect(frame).not.toContain('`code`');
  });

  it('does not render the data panel', () => {
    const { lastFrame } = render(<EngineerChat {...baseProps} />);

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).not.toContain('Data');
    expect(frame).not.toContain('Model');
  });

  it('does not re-render the conversation panel when typing', async () => {
    const onConversationRender = vi.fn();
    const { stdin } = render(
      <EngineerChat
        {...baseProps}
        onConversationRender={onConversationRender}
      />,
    );

    await tick();
    expect(onConversationRender).toHaveBeenCalledTimes(1);

    stdin.write('a');
    await tick();

    expect(onConversationRender).toHaveBeenCalledTimes(1);
  });
});

  it('does not re-render the root when typing', async () => {
    const onRender = vi.fn();
    const { stdin } = render(
      <EngineerChat
        {...baseProps}
        onRender={onRender}
      />,
    );

    await tick();
    expect(onRender).toHaveBeenCalledTimes(1);

    stdin.write('a');
    await tick();

    expect(onRender).toHaveBeenCalledTimes(1);
  });
