import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import type { Meeting, Session } from './core/types.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

const waitFor = async (
  fn: () => boolean,
  {
    timeoutMs = 1500,
    debug,
  }: { timeoutMs?: number; debug?: () => string } = {},
) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const tail = debug ? `\n\nLast frame:\n${debug()}` : '';
  throw new Error(`Timed out waiting for condition${tail}`);
};

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

function mockEngineerRouteBoot({
  base,
  EngineerChat,
}: {
  base: string;
  EngineerChat?: (props: { maxHeight?: number }) => React.ReactNode;
}) {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.XDG_DATA_HOME = base;
  process.env.XDG_CONFIG_HOME = base;
  process.env.HOME = base;

  vi.doMock('./agent/pyodide/assets.js', () => ({
    ensurePyodideAssets: async ({
      onProgress,
    }: {
      onProgress?: (update: RuntimeProgressUpdate) => void;
    }) => {
      onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
      return { ready: true };
    },
  }));
  vi.doMock('@ai-sdk/openai', () => ({
    createOpenAI: () => () => ({}),
  }));
  vi.doMock('./agent/engineer.js', () => ({
    createEngineerSession: () => ({
      close: vi.fn(),
      send: vi.fn(async function* () {}),
    }),
  }));
  vi.doMock('./agent/engineer-logger.js', () => ({
    createEngineerLogger: () => ({
      logger: vi.fn(),
      logSessionStart: vi.fn(),
      logSessionEnd: vi.fn(),
      logTurn: vi.fn(),
      logEvent: vi.fn(),
    }),
  }));
  vi.doMock('./agent/tools.js', () => ({
    makeTools: () => ({}),
  }));
  vi.doMock('./agent/prompt.js', () => ({
    systemPrompt: 'test prompt',
  }));
  vi.doMock('./tui/screens/SeasonPicker.js', () => ({
    SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
      React.useEffect(() => {
        void onSelect(2026);
      }, [onSelect]);
      return null;
    },
  }));
  vi.doMock('./core/f1-api.js', () => ({
    getMeetings: async () => ({
      Year: 2025,
      Meetings: [
        {
          Key: 1,
          Name: 'Test GP',
          Location: 'Nowhere',
          Sessions: [
            {
              Key: 10,
              Name: 'Race',
              Type: 'Race',
              StartDate: '2025-01-01T00:00:00Z',
              EndDate: '2025-01-01T02:00:00Z',
              GmtOffset: '+00:00',
              Path: '2025/test/',
            },
          ],
        },
      ],
    }),
  }));
  vi.doMock('./tui/screens/MeetingPicker.js', () => ({
    MeetingPicker: ({
      meetings,
      onSelect,
    }: {
      meetings: Meeting[];
      onSelect: (meeting: Meeting) => void;
    }) => {
      React.useEffect(() => {
        void onSelect(meetings[0]);
      }, [meetings, onSelect]);
      return null;
    },
  }));
  vi.doMock('./tui/screens/SessionPicker.js', () => ({
    SessionPicker: ({
      meeting,
      onSelect,
    }: {
      meeting: Meeting;
      onSelect: (session: Session) => void;
    }) => {
      React.useEffect(() => {
        void onSelect(meeting.Sessions[0]);
      }, [meeting, onSelect]);
      return null;
    },
  }));
  vi.doMock('./core/download.js', () => ({
    downloadSession: async () => {
      const dir = path.join(base, 'download');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'subscribe.json'), '{}', 'utf-8');
      writeFileSync(path.join(dir, 'live.jsonl'), '', 'utf-8');
      return { dir, lineCount: 0 };
    },
  }));

  if (EngineerChat) {
    vi.doMock('./tui/screens/EngineerChat.js', () => ({
      EngineerChat,
    }));
  } else {
    vi.doMock('./tui/screens/EngineerChat.js', async () => {
      return await vi.importActual('./tui/screens/EngineerChat.js');
    });
  }
}

describe('App engineer shell', () => {
  it('removes the global header and footer on the engineer route', async () => {
    const base = path.join(tmpdir(), `f1aire-engineer-shell-${Date.now()}`);
    mockEngineerRouteBoot({ base });

    const { App } = await import('./app.js');
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Ask the engineer');
    expect(frame).toContain('Quick summary:');
    expect(frame).toContain('Winner: unavailable');
    expect(frame).not.toContain('Quick summary: Winner: unavailable');
    expect(frame).not.toContain('…');
    expect(frame).not.toContain('F1aire - Virtual Race Engineer');
    expect(frame).not.toContain('s settings');
    app.unmount();
  });

  it('does not pass a fixed maxHeight to the engineer screen so the shell can pin its bottom slot fullscreen', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-shell-maxheight-${Date.now()}`,
    );
    const EngineerChat = vi.fn(() => null);
    mockEngineerRouteBoot({ base, EngineerChat });

    const { App } = await import('./app.js');
    const app = await renderTui(<App />);

    await waitFor(() => EngineerChat.mock.calls.length > 0);

    expect(EngineerChat.mock.calls.at(-1)?.[0]?.maxHeight).toBeUndefined();
    app.unmount();
  });

  it('renders the engineer route flush-left so app-level chrome does not own the engineer shell boundary', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-shell-flush-left-${Date.now()}`,
    );
    mockEngineerRouteBoot({
      base,
      EngineerChat: () => <Text>SHELL-ROOT</Text>,
    });

    const { App } = await import('./app.js');
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('SHELL-ROOT'), {
      debug: () => app.lastFrame() ?? '',
    });

    const frame = app.lastFrame() ?? '';
    const firstRenderedLine =
      frame.split('\n').find((line) => line.trim().length > 0) ?? '';
    expect(firstRenderedLine).toBe('SHELL-ROOT');
    app.unmount();
  });
});
