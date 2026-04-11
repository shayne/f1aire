import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function mockSessionRoute({
  base,
  TextComponent,
}: {
  base: string;
  TextComponent: typeof import('#ink').Text;
}) {
  delete process.env.OPENAI_API_KEY;
  process.env.XDG_CONFIG_HOME = base;
  process.env.XDG_DATA_HOME = base;
  process.env.HOME = base;
  let didSelectSession = false;

  vi.doMock('./agent/pyodide/assets.js', () => ({
    ensurePyodideAssets: async ({
      onProgress,
    }: {
      onProgress?: (update: {
        phase: 'downloading' | 'extracting' | 'ready';
        message: string;
      }) => void;
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
      cancel: vi.fn(),
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
      Year: 2026,
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
              StartDate: '2026-01-01T00:00:00Z',
              EndDate: '2026-01-01T02:00:00Z',
              GmtOffset: '+00:00',
              Path: '2026/test/',
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
        if (didSelectSession) return;
        didSelectSession = true;
        void onSelect(meeting.Sessions[0]);
      }, [meeting, onSelect]);
      return <TextComponent>Session picker ready</TextComponent>;
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
}

async function loadApp(base: string) {
  const [{ Text }, { renderTui }] = await Promise.all([
    import('#ink'),
    import('#ink/testing'),
  ]);
  mockSessionRoute({ base, TextComponent: Text });
  const { App } = await import('./app.js');
  return { App, renderTui };
}

describe('App OpenAI auth routing', () => {
  it('asks for ChatGPT-first auth on first engineer launch when no explicit API-key preference is configured', async () => {
    const base = path.join(tmpdir(), `f1aire-app-openai-auth-${Date.now()}`);
    const { App, renderTui } = await loadApp(base);
    const app = await renderTui(<App />);

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('OpenAI auth') &&
        (app.lastFrame() ?? '').includes('Use ChatGPT account (recommended)'),
      { debug: () => app.lastFrame() ?? '' },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Sign in with ChatGPT');
    expect(frame).toContain('Use OpenAI API key');
    expect(frame).not.toContain('Paste a valid key');

    app.unmount();
  });
});
