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
    await tick();

    const pausedFrame = stripAnsi(lastFrame() ?? '');
    expect(pausedFrame).toContain('Jump to bottom');
    expect(pausedFrame).toMatch(/─{10,}/);

    stdin.write('\u001b[6~');
    await tick();
    await tick();

    expect(stripAnsi(lastFrame() ?? '')).not.toContain('Jump to bottom');
    unmount();
  });

  it('renders the jump-to-latest pill without overwriting transcript content', async () => {
    const { stdin, lastFrame, unmount } = await renderTui(
      <EngineerChat
        {...baseProps}
        maxHeight={20}
        activity={['Response ready']}
        messages={[
          {
            role: 'assistant',
            content:
              'Quick summary:\n\n- Winner: 1 (#1)\n- Fastest lap: 1 (#1) 1:34.669\n- Total laps: unavailable',
          },
          { role: 'user', content: 'Who looks strongest on pace so far?' },
          {
            role: 'assistant',
            content:
              'Evidence I have right now is best-lap from TimingData (single-lap, not long-run pace):\n\n- #1 Lando NORRIS (McLaren): 1:34.669 (lap 26)\n- #3 Max VERSTAPPEN (Red Bull): 1:34.798 (lap 130)\n- #16 Charles LECLERC (Ferrari): 1:35.190 (lap 46)\n\nCaveat: that is peak lap time, not sustained pace. For strongest on pace I would compute median of last 5-10 green, non-pit laps per driver from the lap table; I can do that if you want me to run it.',
          },
          {
            role: 'user',
            content: 'What does tyre usage tell us so far? Keep it concise.',
          },
          {
            role: 'assistant',
            content:
              'Tyre usage so far (from TimingAppData stints, not current-tyre feed):\n\n- Main compounds used: Medium + Soft dominate across the field.\n- Hard runners observed: #3 VER, #11 PER, #12 ANT, #43 COL, #55 SAI, #63 RUS, #77 BOT (hard stints logged).\n- Intermediates: only #31 OCO shows an Inter stint.\n- Many drivers have cycled multiple Soft sets suggesting short-run work rather than long-run management.\n\nUncertainty: I have not computed the current compound mix per driver.',
          },
        ]}
      />,
    );

    await tick();

    stdin.write('\u001b[5~');
    await tick();
    await tick();

    const frame = stripAnsi(lastFrame() ?? '');
    expect(frame).toContain('Jump to bottom');
    expect(frame).not.toContain('Hard runners observed:  Jump to bottom');
    unmount();
  });
});
