import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { render } from 'ink-testing-library';

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

describe('App OpenAI key prompt', () => {
  it('prompts for key after download when env and stored key are missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const base = path.join(tmpdir(), `f1aire-app-${Date.now()}`);
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;

    vi.doMock('./agent/pyodide/assets.js', () => ({
      ensurePyodideAssets: async ({ onProgress }: any) => {
        onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
        return { ready: true };
      },
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

    const { lastFrame } = render(<App />);
    await waitFor(() => (lastFrame() ?? '').includes('OpenAI API Key'), {
      debug: () => lastFrame() ?? '',
    });
  });
});
