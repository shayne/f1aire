import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderTui } from '#ink/testing';
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
  it('shows an onboarding note and prompt-focused composer on first render', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerChat {...baseProps} maxHeight={18} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain('Ask about pace, tyres, pit windows, or traffic.');
    expect(frame).toContain(
      'Ask the engineer about pace, tyres, traffic, or strategy...',
    );
    unmount();
  });

  it('renders streaming status in a dedicated row instead of appending it to composer hints', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={24}
        status="Comparing tyre stints"
        isStreaming
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain('Comparing tyre stints');
    expect(frame).not.toContain('Status · Comparing tyre stints');
    expect(frame).not.toContain(
      'enter send · shift+enter newline · tab details · streaming',
    );
    unmount();
  });

  it('renders assistant markdown without literal markers', async () => {
    const { lastFrame, unmount } = await renderTui(
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
    unmount();
  });

  it('does not render the data panel', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerChat {...baseProps} />,
    );

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).not.toContain('Data');
    expect(frame).not.toContain('Model');
    unmount();
  });

  it('does not re-render the conversation panel when typing', async () => {
    const onConversationRender = vi.fn();
    const { stdin, unmount } = await renderTui(
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
    unmount();
  });

  it('shows details by default and keeps composer typing intact while Tab collapses and reopens them', async () => {
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={44}
        pythonCode={'import numpy as np\nprint(\"hi\")\n2+2'}
      />,
    );

    await tick();
    expect(stripAnsi(lastFrame() ?? '')).toContain('Python');
    expect(stripAnsi(lastFrame() ?? '')).toContain('print(\"hi\")');

    stdin.write('i');
    await tick();

    const typedFrame = stripAnsi(lastFrame() ?? '');
    expect(typedFrame).toContain('› i');
    expect(typedFrame).toContain('Python');

    stdin.write('\t');
    await tick();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('› i');
    expect(frame).not.toContain('Python');

    stdin.write('\t');
    await tick();

    const reopenedFrame = stripAnsi(lastFrame() ?? '');
    expect(reopenedFrame).toContain('› i');
    expect(reopenedFrame).toContain('print(\"hi\")');
    unmount();
  });

  it('starts with details collapsed on compact terminals so the composer and transcript remain visible', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={24}
        pythonCode={'import numpy as np\nprint("hi")\n2+2'}
      />,
    );

    const frame = stripAnsi(lastFrame() ?? '');

    expect(frame).toContain('· Idle');
    expect(frame).toContain(
      'Ask the engineer about pace, tyres, traffic, or strategy...',
    );
    expect(frame).not.toContain('Python');
    expect(frame).not.toContain('print("hi")');
    unmount();
  });

  it('auto-collapses details when the terminal becomes compact so the composer stays visible', async () => {
    const { lastFrame, rerender, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={44}
        pythonCode={'import numpy as np\nprint("hi")\n2+2'}
      />,
    );

    await tick();
    expect(stripAnsi(lastFrame() ?? '')).toContain('Python');

    rerender(
      <EngineerChat
        {...baseProps}
        maxHeight={24}
        pythonCode={'import numpy as np\nprint("hi")\n2+2'}
      />,
    );
    await tick();

    const compactFrame = stripAnsi(lastFrame() ?? '');
    expect(compactFrame).toContain(
      'Ask the engineer about pace, tyres, traffic, or strategy...',
    );
    expect(compactFrame).not.toContain('Python');
    expect(compactFrame).not.toContain('print("hi")');
    unmount();
  });

  it('shows the transcript pause/live workflow with PageUp and PageDown', async () => {
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
      />,
    );

    await tick();

    const initialFrame = stripAnsi(lastFrame() ?? '');
    expect(initialFrame).toContain(
      'enter send · shift+enter newline · tab details',
    );
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
    unmount();
  });

  it('keeps the latest transcript rows visible while live', async () => {
    const { lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={16}
        messages={[
          {
            role: 'user',
            content: 'alpha row',
          },
          {
            role: 'assistant',
            content: 'beta row',
          },
          {
            role: 'user',
            content: 'gamma row\ndelta row',
          },
        ]}
      />,
    );

    await tick();

    const liveFrame = stripAnsi(lastFrame() ?? '');
    expect(liveFrame).toContain('beta row');
    expect(liveFrame).toContain('delta row');
    expect(liveFrame).not.toContain('Viewing earlier output');
    unmount();
  });

  it('shows new updates below when streaming text changes while paused', async () => {
    const { stdin, lastFrame, rerender, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        streamingText="first streaming chunk"
        isStreaming
      />,
    );

    await tick();

    stdin.write('\u001b[5~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'Viewing earlier output · pgdn to return live',
    );

    rerender(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        streamingText="updated streaming chunk"
        isStreaming
      />,
    );
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'New updates below · pgdn to catch up',
    );
    unmount();
  });

  it('shows new updates below when pending status changes while paused', async () => {
    const { stdin, lastFrame, rerender, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        isStreaming
        status="Thinking"
      />,
    );

    await tick();

    stdin.write('\u001b[5~');
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'Viewing earlier output · pgdn to return live',
    );

    rerender(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        isStreaming
        status="Running tool"
      />,
    );
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).toContain(
      'New updates below · pgdn to catch up',
    );
    unmount();
  });

  it('does not treat a width change as new transcript content while paused', async () => {
    const rendered = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        streamingText="first streaming chunk"
        isStreaming
      />,
    );

    rendered.rerender(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        streamingText="first streaming chunk"
        isStreaming
      />,
    );
    await tick();

    rendered.stdin.write('\u001b[5~');
    await tick();

    expect(stripAnsi(rendered.lastFrame() ?? '')).toContain(
      'Viewing earlier output · pgdn to return live',
    );

    rendered.resize(120, 24);
    rendered.rerender(
      <EngineerChat
        {...baseProps}
        maxHeight={14}
        messages={makeMessages(16)}
        streamingText="first streaming chunk"
        isStreaming
      />,
    );
    await tick();

    expect(stripAnsi(rendered.lastFrame() ?? '')).toContain(
      'Viewing earlier output · pgdn to return live',
    );
    rendered.unmount();
  });

  it('does not re-render the root when typing', async () => {
    const onRender = vi.fn();
    const { stdin, unmount } = await renderTui(
      <EngineerChat {...baseProps} onRender={onRender} />,
    );

    await tick();
    expect(onRender).toHaveBeenCalledTimes(1);

    stdin.write('a');
    await tick();

    expect(onRender).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not re-render the root when the composer grows multiline input', async () => {
    const onRender = vi.fn();
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat {...baseProps} maxHeight={20} onRender={onRender} />,
    );

    await tick();
    expect(onRender).toHaveBeenCalledTimes(1);

    stdin.write('p');
    stdin.write('\u001b[13;2u');
    stdin.write('l');
    await tick();

    expect(onRender).toHaveBeenCalledTimes(1);

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('› p');
    expect(frame).toContain('  l');
    unmount();
  });
});
