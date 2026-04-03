import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
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
    await new Promise((r) => setTimeout(r, 10));
  }
  const tail = debug ? `\n\nLast frame:\n${debug()}` : '';
  throw new Error(`Timed out waiting for condition${tail}`);
};

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

describe('App OpenAI key prompt', () => {
  it('prompts for key after download when env and stored key are missing and writes titles to the renderer stdout', async () => {
    delete process.env.OPENAI_API_KEY;
    const base = path.join(tmpdir(), `f1aire-app-${Date.now()}`);
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

    const processWriteSpy = vi.spyOn(process.stdout, 'write');
    const { App } = await import('./app.js');

    const app = await renderTui(<App />);
    const rendererWrites: string[] = [];
    const originalRendererWrite = app.stdout.write.bind(app.stdout);
    app.stdout.write = ((
      chunk: Parameters<typeof app.stdout.write>[0],
      ...args: Parameters<typeof app.stdout.write> extends [
        unknown,
        ...infer Rest,
      ]
        ? Rest
        : never
    ) => {
      rendererWrites.push(String(chunk));
      return originalRendererWrite(chunk, ...args);
    }) as typeof app.stdout.write;

    await waitFor(() => (app.lastFrame() ?? '').includes('OpenAI API Key'), {
      debug: () => app.lastFrame() ?? '',
    });
    await waitFor(() =>
      rendererWrites.some((chunk) => chunk.includes('OpenAI API Key')),
    );
    expect(
      processWriteSpy.mock.calls.some((call) =>
        String(call[0]).includes('OpenAI API Key'),
      ),
    ).toBe(false);
    app.unmount();
  });
});
