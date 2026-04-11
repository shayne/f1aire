import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
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

function mousePress(col: number, row: number): string {
  return `\u001b[<0;${col};${row}M`;
}

function mouseDrag(col: number, row: number): string {
  return `\u001b[<32;${col};${row}M`;
}

function mouseRelease(col: number, row: number): string {
  return `\u001b[<0;${col};${row}m`;
}

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

function mockEngineerRouteBoot({
  base,
  createEngineerSession,
  TextComponent,
}: {
  base: string;
  createEngineerSession?: () => {
    cancel?: () => void;
    close?: () => void;
    getTranscriptEvents?: () => unknown[];
    send: (input: string) => AsyncIterable<string>;
  };
  TextComponent: typeof import('#ink').Text;
}) {
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.XDG_DATA_HOME = base;
  process.env.XDG_CONFIG_HOME = base;
  process.env.HOME = base;
  mkdirSync(path.join(base, 'f1aire'), { recursive: true });
  writeFileSync(
    path.join(base, 'f1aire', 'config.json'),
    `${JSON.stringify({ openaiAuthPreference: 'api-key' }, null, 2)}\n`,
    'utf-8',
  );
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
    createEngineerSession:
      createEngineerSession ??
      (() => ({
        cancel: vi.fn(),
        close: vi.fn(),
        send: vi.fn(async function* () {
          yield Array.from(
            { length: 32 },
            (_, index) => `response row ${index + 1}`,
          ).join('\n');
        }),
      })),
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

      return didSelectSession ? (
        <TextComponent>Session picker ready</TextComponent>
      ) : null;
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

async function loadAppHarness({
  base,
  createEngineerSession,
}: {
  base: string;
  createEngineerSession?: Parameters<
    typeof mockEngineerRouteBoot
  >[0]['createEngineerSession'];
}) {
  const [{ Text }, { renderTui }] = await Promise.all([
    import('#ink'),
    import('#ink/testing'),
  ]);
  mockEngineerRouteBoot({ base, createEngineerSession, TextComponent: Text });
  const { App } = await import('./app.js');

  return { App, renderTui };
}

describe('App engineer keybindings', () => {
  it(
    'keeps composer and transcript bindings above global nav in engineer mode while idle Escape asks for leave confirmation',
    async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-keybindings-${Date.now()}`,
    );
    const { App, renderTui } = await loadAppHarness({ base });
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
      () => stripAnsi(app.lastFrame() ?? '').includes('Leave engineer session?'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\r');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('Session picker ready'),
      { debug: () => app.lastFrame() ?? '' },
    );

      app.unmount();
    },
    15_000,
  );

  it(
    'copies a text selection on ctrl+c instead of quitting engineer mode',
    async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-selection-copy-${Date.now()}`,
    );
    process.env.SSH_CONNECTION = 'test';
    delete process.env.TMUX;

    const { App, renderTui } = await loadAppHarness({ base });
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });
    await tick();

    let output = '';
    app.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
    });
    await tick();
    output = '';

    app.stdin.write(mousePress(1, 1));
    app.stdin.write(mouseDrag(4, 1));
    app.stdin.write(mouseRelease(4, 1));
    await waitFor(
      () => output.includes('\u001b]52;c;'),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(output).toContain('\u001b]52;c;');
    output = '';

    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);

    app.stdin.write('\x03');
    await waitFor(
      () => output.includes('\u001b]52;c;'),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(processExitSpy).not.toHaveBeenCalled();
    expect(output).toContain('\u001b]52;c;');
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('Ask the engineer');

      app.unmount();
    },
    15_000,
  );

  it('asks for confirmation on idle Escape, cancels the dialog on Escape, and leaves on Enter', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-escape-confirm-${Date.now()}`,
    );

    const { App, renderTui } = await loadAppHarness({ base });
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });

    app.stdin.write('\u001b');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('Leave engineer session?'),
      { debug: () => app.lastFrame() ?? '' },
    );
    expect(stripAnsi(app.lastFrame() ?? '')).toContain(
      '2026 Test GP · Race · Latest',
    );

    app.stdin.write('\u001b');
    await waitFor(
      () =>
        stripAnsi(app.lastFrame() ?? '').includes('Ask the engineer') &&
        !stripAnsi(app.lastFrame() ?? '').includes('Leave engineer session?'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\u001b');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('Leave engineer session?'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\r');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('Session picker ready'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.unmount();
  });

  it('cancels a running engineer turn on Escape without leaving the engineer screen', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-escape-interrupt-${Date.now()}`,
    );
    const cancelEngineer = vi.fn();
    let resolveStream: (() => void) | null = null;
    const streamDone = new Promise<void>((resolve) => {
      resolveStream = resolve;
    });

    const { App, renderTui } = await loadAppHarness({
      base,
      createEngineerSession: () => ({
        cancel: cancelEngineer,
        close: vi.fn(),
        send: vi.fn(async function* () {
          yield 'partial response';
          await streamDone;
        }),
      }),
    });
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });

    app.stdin.write('status');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('› status'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\r');
    await waitFor(
      () => stripAnsi(app.lastFrame() ?? '').includes('partial response'),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.stdin.write('\u001b');
    await waitFor(
      () => cancelEngineer.mock.calls.length === 1,
      { debug: () => app.lastFrame() ?? '' },
    );
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('Ask the engineer');
    expect(stripAnsi(app.lastFrame() ?? '')).not.toContain(
      'Leave engineer session?',
    );

    resolveStream?.();
    await tick();
    app.unmount();
  });

  it('requires a second idle Ctrl+C before quitting when no text is selected', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-engineer-ctrlc-confirm-${Date.now()}`,
    );

    const { App, renderTui } = await loadAppHarness({ base });
    const app = await renderTui(<App />);

    await waitFor(() => (app.lastFrame() ?? '').includes('Ask the engineer'), {
      debug: () => app.lastFrame() ?? '',
    });

    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);

    app.stdin.write('\x03');
    await waitFor(
      () =>
        stripAnsi(app.lastFrame() ?? '').includes(
          'Press Ctrl+C again to quit',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(processExitSpy).not.toHaveBeenCalled();

    app.stdin.write('\x03');
    await tick();

    expect(processExitSpy).toHaveBeenCalledWith(0);
    app.unmount();
  });
});
