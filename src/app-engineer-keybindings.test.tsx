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

const stripAnsi = (value: string) => value.replace(/\u001b\[[0-9;]*m/g, '');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

function mockEngineerRouteBoot({ base }: { base: string }) {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.XDG_DATA_HOME = base;
  process.env.XDG_CONFIG_HOME = base;
  process.env.HOME = base;
  let didSelectSession = false;

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
      send: vi.fn(async function* () {
        yield Array.from(
          { length: 32 },
          (_, index) => `response row ${index + 1}`,
        ).join('\n');
      }),
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
        if (didSelectSession) return;
        didSelectSession = true;
        void onSelect(meeting.Sessions[0]);
      }, [meeting, onSelect]);

      return didSelectSession ? <Text>Session picker ready</Text> : null;
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

describe('App engineer keybindings', () => {
  it('keeps composer and transcript bindings above global nav in engineer mode while Escape still exits', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-keybindings-${Date.now()}`,
    );
    mockEngineerRouteBoot({ base });

    const { App } = await import('./app.js');
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });
    await tick();

    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);

    app.stdin.write('q');
    expect(processExitSpy).not.toHaveBeenCalled();
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('› q'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('b');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('› qb'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\x7f');
    await waitFor(
      () =>
        stripAnsi(app.lastFrame() ?? '').includes('› q') &&
        !stripAnsi(app.lastFrame() ?? '').includes('› qb'),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('Ask the engineer');

    app.stdin.write('\r');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('response row 32'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\u001b[5~');
    await waitFor(
      () =>
        stripAnsi(app.lastFrame() ?? '').includes(
          'Viewing earlier output · pgdn to return live',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\u001b');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('Session picker ready'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.unmount();
  });
});
