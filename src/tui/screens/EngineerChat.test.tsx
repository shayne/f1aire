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

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `message ${index + 1}`,
  }));
}

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

  it('keeps composer typing intact and toggles the details panel with Tab', async () => {
    const { stdin, lastFrame } = render(
      <EngineerChat
        {...baseProps}
        maxHeight={44}
        pythonCode={'import numpy as np\nprint(\"hi\")\n2+2'}
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

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Python');
    expect(frame).toContain('print(\"hi\")');
  });

  it('shows the transcript pause/live workflow with PageUp and PageDown', async () => {
    const { stdin, lastFrame } = render(
      <EngineerChat {...baseProps} maxHeight={14} messages={makeMessages(16)} />,
    );

    await tick();

    const initialFrame = stripAnsi(lastFrame() ?? '');
    expect(initialFrame).toContain('enter send · shift+enter newline · TAB details');
    expect(initialFrame).not.toContain('Viewing earlier output');

    stdin.write('\u001b[5~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'Viewing earlier output · pgdn to return live',
    );

    stdin.write('\u001b[6~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).not.toContain(
      'Viewing earlier output · pgdn to return live',
    );
  });

  it('does not re-render the root when typing', async () => {
    const onRender = vi.fn();
    const { stdin } = render(<EngineerChat {...baseProps} onRender={onRender} />);

    await tick();
    expect(onRender).toHaveBeenCalledTimes(1);

    stdin.write('a');
    await tick();

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});
