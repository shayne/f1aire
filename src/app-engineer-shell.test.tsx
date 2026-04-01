import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderTui } from '#ink/testing';

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

describe('App engineer shell', () => {
  it('removes the global header and footer on the engineer route', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(tmpdir(), `f1aire-engineer-shell-${Date.now()}`);
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;

    vi.doMock('./agent/pyodide/assets.js', () => ({
      ensurePyodideAssets: async ({ onProgress }: any) => {
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
        sendUserMessage: vi.fn(),
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
      SeasonPicker: ({ onSelect }: any) => {
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
      MeetingPicker: ({ meetings, onSelect }: any) => {
        React.useEffect(() => {
          void onSelect(meetings[0]);
        }, [meetings, onSelect]);
        return null;
      },
    }));
    vi.doMock('./tui/screens/SessionPicker.js', () => ({
      SessionPicker: ({ meeting, onSelect }: any) => {
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

    const { App } = await import('./app.js');
    const app = await renderTui(<App />);

    await waitFor(
      () => (app.lastFrame() ?? '').includes('Ask the engineer'),
      { debug: () => app.lastFrame() ?? '' },
    );

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
});
