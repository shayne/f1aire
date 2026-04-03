import React from 'react';
import { renderTui } from '#ink/testing';
import { describe, expect, it, vi } from 'vitest';

const transcriptRowRenderProbe = vi.hoisted(() => ({
  onHistoricalMessageLineRender: vi.fn(),
}));

vi.mock('#ink', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const actual = await vi.importActual<typeof import('#ink')>('#ink');

  function getHistoricalMessageText(children: React.ReactNode): string | null {
    const child = React.Children.toArray(children)[0];
    if (!React.isValidElement(child)) {
      return null;
    }

    const props = child.props as { children?: React.ReactNode };
    if (typeof props.children !== 'string') {
      return null;
    }

    return /^  historical message \d+$/.test(props.children)
      ? props.children
      : null;
  }

  const Box = React.forwardRef<
    React.ElementRef<typeof actual.Box>,
    React.ComponentProps<typeof actual.Box>
  >(function Box(props, ref) {
    const historicalMessageText = getHistoricalMessageText(props.children);
    if (historicalMessageText) {
      transcriptRowRenderProbe.onHistoricalMessageLineRender(
        historicalMessageText,
      );
    }

    return React.createElement(actual.Box, {
      ...props,
      ref,
    });
  });
  Box.displayName = 'Box';

  return {
    ...actual,
    Box,
  };
});

const { EngineerChat } = await import('./screens/EngineerChat.js');

const messages = Array.from({ length: 120 }, (_, index) => ({
  role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
  content: `historical message ${index + 1}`,
}));

const baseProps = {
  messages,
  onSend: () => {},
  year: 2025,
  meeting: {
    Key: 1,
    Name: 'Monaco Grand Prix',
    Location: 'Monaco',
    Sessions: [],
  },
  session: {
    Key: 10,
    Name: 'Race',
    Type: 'Race',
    StartDate: '2025-05-25T13:00:00Z',
    EndDate: '2025-05-25T15:00:00Z',
    GmtOffset: '+00:00',
  },
  summary: null,
  asOfLabel: 'Latest',
  maxHeight: 500,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('EngineerChat render budget', () => {
  it('keeps one streaming delta from re-rendering/remapping historical transcript row wrappers', async () => {
    const rendered = await renderTui(
      <EngineerChat
        {...baseProps}
        streamingText="chunk 1"
        isStreaming
        status="Thinking..."
        activity={['Thinking...']}
      />,
    );

    await tick();
    transcriptRowRenderProbe.onHistoricalMessageLineRender.mockClear();

    rendered.rerender(
      <EngineerChat
        {...baseProps}
        streamingText="chunk 2"
        isStreaming
        status="Thinking..."
        activity={['Thinking...']}
      />,
    );

    await tick();

    expect(
      transcriptRowRenderProbe.onHistoricalMessageLineRender,
    ).toHaveBeenCalledTimes(0);
    rendered.unmount();
  });
});
