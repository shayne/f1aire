import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import React from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import type { Summary } from './core/summary.js';
import type { Meeting, Session } from './core/types.js';
import { getBackScreen } from './tui/navigation.js';

const originalEnv = { ...process.env };

const session: Session = {
  Key: 10,
  Name: 'Race',
  Type: 'Race',
  StartDate: '2024-01-01T00:00:00.000Z',
  EndDate: '2024-01-01T01:00:00.000Z',
  GmtOffset: '+00:00',
  Path: '2024/test/',
};

const meeting: Meeting = {
  Key: 1,
  Name: 'Test GP',
  Location: 'Testville',
  Sessions: [session],
};

const meetings = [meeting];
const year = 2024;

const summary: Summary = {
  winner: null,
  fastestLap: null,
  totalLaps: null,
};

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

async function waitFor(
  fn: () => boolean,
  {
    timeoutMs = 3000,
    debug,
  }: { timeoutMs?: number; debug?: () => string } = {},
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (fn()) return;

  const tail = debug ? `\n\nLast frame:\n${debug()}` : '';
  throw new Error(`Timed out waiting for condition${tail}`);
}

describe('getBackScreen', () => {
  it('returns season from meeting', () => {
    expect(getBackScreen({ name: 'meeting', year, meetings })).toEqual({ name: 'season' });
  });

  it('returns meeting from session', () => {
    expect(getBackScreen({ name: 'session', year, meetings, meeting })).toEqual({
      name: 'meeting',
      year,
      meetings,
    });
  });

  it('returns session from downloading', () => {
    expect(
      getBackScreen({ name: 'downloading', year, meetings, meeting, session }),
    ).toEqual({
      name: 'session',
      year,
      meetings,
      meeting,
    });
  });

  it('returns session from summary', () => {
    expect(
      getBackScreen({ name: 'summary', year, meetings, meeting, summary, dir: '/tmp' }),
    ).toEqual({
      name: 'session',
      year,
      meetings,
      meeting,
    });
  });

  it('returns returnTo for settings and apiKey screens', () => {
    const returnTo = { name: 'season' } as const;

    expect(getBackScreen({ name: 'settings', returnTo })).toEqual(returnTo);
    expect(getBackScreen({ name: 'apiKey', returnTo })).toEqual(returnTo);
  });
});

describe('App shell routes', () => {
  it('renders the season route through the shared f1aire shell instead of the engineer shell', async () => {
    vi.doMock('./agent/pyodide/assets.js', () => ({
      ensurePyodideAssets: async ({
        onProgress,
      }: {
        onProgress?: (update: RuntimeProgressUpdate) => void;
      }) => {
        onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
      },
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Select a season') &&
        (app.lastFrame() ?? '').includes('Start a f1aire race-engineer session'),
      {
        debug: () => app.lastFrame() ?? '',
      },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('f1aire');
    expect(frame).toContain('Virtual Race Engineer');
    expect(frame).toContain('Select a season');
    expect(frame).toContain('Start a f1aire race-engineer session');
    expect(frame).not.toContain('Ask the engineer');
    expect(frame).not.toContain('Quick summary:');
    app.unmount();
  });

  it('resumes a stored engineer transcript when the same session is reopened', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(tmpdir(), `f1aire-app-resume-${Date.now()}`);
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;

    mkdirSync(path.join(base, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    writeFileSync(
      path.join(base, 'f1aire', 'data', 'transcripts', '2024-1-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'user-1',
            type: 'user-message',
            text: 'Compare stint one tyre dropoff.',
          },
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Ferrari stayed flatter over the first 12 laps.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );

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
    vi.doMock('./agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('./agent/prompt.js', () => ({
      systemPrompt: 'test prompt',
    }));
    vi.doMock('./agent/tools.js', () => ({
      makeTools: () => ({}),
    }));
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
        }, [meeting, onSelect]);
        return null;
      },
    }));
    vi.doMock('./tui/screens/Summary.js', () => ({
      Summary: ({ onResume }: { onResume?: () => void }) => {
        React.useEffect(() => {
          onResume?.();
        }, [onResume]);

        return React.createElement(Text, null, 'Prior engineer transcript found');
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
    vi.doMock('./tui/screens/EngineerChat.js', () => ({
      EngineerChat: ({
        messages,
      }: {
        messages: { role: 'user' | 'assistant'; content: string }[];
      }) =>
        React.createElement(
          Text,
          null,
          messages
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n'),
        ),
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () => (app.lastFrame() ?? '').includes('Prior engineer transcript found'),
      {
        debug: () => app.lastFrame() ?? '',
      },
    );

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes(
          'assistant: Ferrari stayed flatter over the first 12 laps.',
        ),
      {
        debug: () => app.lastFrame() ?? '',
      },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('user: Compare stint one tyre dropoff.');
    expect(frame).not.toContain('Quick summary:');
    app.unmount();
  });

  it('keeps a failed direct summary resume retryable when engineer startup rejects', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(
      tmpdir(),
      `f1aire-app-resume-retry-${Date.now()}`,
    );
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;
    let resumeSummary: (() => void) | undefined;
    const createEngineerSession = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('engineer boot failed');
      })
      .mockImplementation(({ initialTranscript }) => ({
        getTranscriptEvents: () => initialTranscript,
        send: vi.fn(async function* () {}),
      }));

    mkdirSync(path.join(base, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    writeFileSync(
      path.join(base, 'f1aire', 'data', 'transcripts', '2024-1-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Recovered transcript reply.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );

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
      createEngineerSession,
    }));
    vi.doMock('./agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('./agent/prompt.js', () => ({
      systemPrompt: 'test prompt',
    }));
    vi.doMock('./agent/tools.js', () => ({
      makeTools: () => ({}),
    }));
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
        }, [meeting, onSelect]);
        return null;
      },
    }));
    vi.doMock('./tui/screens/Summary.js', () => ({
      Summary: ({
        onResume,
        resumeError,
      }: {
        onResume?: () => void;
        resumeError?: string | null;
      }) => {
        resumeSummary = onResume;
        return React.createElement(
          Text,
          null,
          [
            'Prior engineer transcript found',
            resumeError ? `Resume failed: ${resumeError}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
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
    vi.doMock('./tui/screens/EngineerChat.js', () => ({
      EngineerChat: ({
        messages,
      }: {
        messages: { role: 'user' | 'assistant'; content: string }[];
      }) =>
        React.createElement(
          Text,
          null,
          messages
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n'),
        ),
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Prior engineer transcript found') &&
        typeof resumeSummary === 'function',
      { debug: () => app.lastFrame() ?? '' },
    );

    resumeSummary?.();

    await waitFor(
      () =>
        createEngineerSession.mock.calls.length === 1 &&
        (app.lastFrame() ?? '').includes(
          'Resume failed: engineer boot failed',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    resumeSummary?.();

    await waitFor(
      () =>
        createEngineerSession.mock.calls.length === 2 &&
        (app.lastFrame() ?? '').includes(
          'assistant: Recovered transcript reply.',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.unmount();
  });

  it('clears a stale summary resume error after backing out to session and reopening the summary route', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(
      tmpdir(),
      `f1aire-app-resume-error-clear-${Date.now()}`,
    );
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;
    let resumeSummary: (() => void) | undefined;
    let triggerGlobalBack: (() => boolean | void) | undefined;
    const createEngineerSession = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('engineer boot failed');
      })
      .mockImplementation(({ initialTranscript }) => ({
        getTranscriptEvents: () => initialTranscript,
        send: vi.fn(async function* () {}),
      }));

    mkdirSync(path.join(base, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    writeFileSync(
      path.join(base, 'f1aire', 'data', 'transcripts', '2024-1-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Stored transcript exists.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );

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
      createEngineerSession,
    }));
    vi.doMock('./agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('./agent/prompt.js', () => ({
      systemPrompt: 'test prompt',
    }));
    vi.doMock('./agent/tools.js', () => ({
      makeTools: () => ({}),
    }));
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
        }, [meeting, onSelect]);
        return null;
      },
    }));
    vi.doMock('./tui/screens/Summary.js', () => ({
      Summary: ({
        onResume,
        resumeError,
      }: {
        onResume?: () => void;
        resumeError?: string | null;
      }) => {
        resumeSummary = onResume;
        return React.createElement(
          Text,
          null,
          [
            'Prior engineer transcript found',
            resumeError ? `Resume failed: ${resumeError}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      },
    }));
    vi.doMock('./tui/keybindings/use-keybindings.js', () => ({
      useKeybindings: ({
        bindings,
      }: {
        bindings: Array<{
          action: string;
          context: string;
          key: { escape?: boolean };
          run: () => boolean | void;
        }>;
      }) => {
        triggerGlobalBack = bindings.find(
          (binding) =>
            binding.action === 'global.back' &&
            binding.context === 'global' &&
            binding.key.escape,
        )?.run;
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
    vi.doMock('./tui/screens/EngineerChat.js', () => ({
      EngineerChat: ({
        messages,
      }: {
        messages: { role: 'user' | 'assistant'; content: string }[];
      }) =>
        React.createElement(
          Text,
          null,
          messages
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n'),
        ),
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Prior engineer transcript found') &&
        typeof resumeSummary === 'function',
      { debug: () => app.lastFrame() ?? '' },
    );

    resumeSummary?.();

    await waitFor(
      () =>
        createEngineerSession.mock.calls.length === 1 &&
        (app.lastFrame() ?? '').includes(
          'Resume failed: engineer boot failed',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    triggerGlobalBack?.();

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Prior engineer transcript found') &&
        !(app.lastFrame() ?? '').includes(
          'Resume failed: engineer boot failed',
        ) &&
        typeof resumeSummary === 'function',
      { debug: () => app.lastFrame() ?? '' },
    );

    app.unmount();
  });

  it('shows a resume cue on the session-ready route when a transcript exists for the downloaded session', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(
      tmpdir(),
      `f1aire-app-resume-cue-${Date.now()}`,
    );
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;

    mkdirSync(path.join(base, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    writeFileSync(
      path.join(base, 'f1aire', 'data', 'transcripts', '2024-1-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Stored transcript exists.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );

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
    vi.doMock('./agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('./agent/prompt.js', () => ({
      systemPrompt: 'test prompt',
    }));
    vi.doMock('./agent/tools.js', () => ({
      makeTools: () => ({}),
    }));
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
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
    vi.doMock('./tui/screens/Summary.js', async () => {
      return await vi.importActual('./tui/screens/Summary.js');
    });

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () => (app.lastFrame() ?? '').includes('Prior engineer transcript found'),
      { debug: () => app.lastFrame() ?? '' },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('Summary');
    expect(frame).toContain('Prior engineer transcript found');
    expect(frame).toContain('Resume prior engineer transcript');
    app.unmount();
  });

  it('keeps the summary resume action live after backing out of the API-key prompt', async () => {
    delete process.env.OPENAI_API_KEY;
    const base = path.join(
      tmpdir(),
      `f1aire-app-resume-back-${Date.now()}`,
    );
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;
    let resumeSummary: (() => void) | undefined;
    let triggerGlobalBack: (() => boolean | void) | undefined;

    mkdirSync(path.join(base, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    writeFileSync(
      path.join(base, 'f1aire', 'data', 'transcripts', '2024-1-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Stored transcript exists.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );

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
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
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
    vi.doMock('./tui/screens/Summary.js', () => ({
      Summary: ({ onResume }: { onResume?: () => void }) => {
        resumeSummary = onResume;
        return React.createElement(
          Text,
          null,
          'Prior engineer transcript found',
        );
      },
    }));
    vi.doMock('./tui/keybindings/use-keybindings.js', () => ({
      useKeybindings: ({
        bindings,
      }: {
        bindings: Array<{
          action: string;
          context: string;
          key: { escape?: boolean };
          run: () => boolean | void;
        }>;
      }) => {
        triggerGlobalBack = bindings.find(
          (binding) =>
            binding.action === 'global.back' &&
            binding.context === 'global' &&
            binding.key.escape,
        )?.run;
      },
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Prior engineer transcript found') &&
        typeof resumeSummary === 'function',
      { debug: () => app.lastFrame() ?? '' },
    );

    resumeSummary?.();
    await waitFor(() => (app.lastFrame() ?? '').includes('OpenAI API Key'), {
      debug: () => app.lastFrame() ?? '',
    });

    triggerGlobalBack?.();
    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Prior engineer transcript found') &&
        typeof resumeSummary === 'function',
      { debug: () => app.lastFrame() ?? '' },
    );

    resumeSummary?.();
    await waitFor(() => (app.lastFrame() ?? '').includes('OpenAI API Key'), {
      debug: () => app.lastFrame() ?? '',
    });

    app.unmount();
  });

  it('falls back to a fresh engineer session when transcript probing fails during download completion', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const base = path.join(
      tmpdir(),
      `f1aire-app-transcript-probe-error-${Date.now()}`,
    );
    process.env.XDG_DATA_HOME = base;
    process.env.XDG_CONFIG_HOME = base;
    process.env.HOME = base;

    vi.doMock('./agent/session-transcript-store.js', async () => {
      const actual = await vi.importActual<
        typeof import('./agent/session-transcript-store.js')
      >('./agent/session-transcript-store.js');

      return {
        ...actual,
        loadTranscriptEvents: vi.fn(async () => {
          throw Object.assign(new Error('permission denied'), {
            code: 'EACCES',
          });
        }),
      };
    });
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
      createEngineerSession: ({ initialTranscript }: { initialTranscript: [] }) => ({
        getTranscriptEvents: () => initialTranscript,
        send: vi.fn(async function* () {}),
      }),
    }));
    vi.doMock('./agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('./agent/prompt.js', () => ({
      systemPrompt: 'test prompt',
    }));
    vi.doMock('./agent/tools.js', () => ({
      makeTools: () => ({}),
    }));
    vi.doMock('./tui/screens/SeasonPicker.js', () => ({
      SeasonPicker: ({ onSelect }: { onSelect: (year: number) => void }) => {
        React.useEffect(() => {
          void onSelect(2024);
        }, [onSelect]);
        return null;
      },
    }));
    vi.doMock('./core/f1-api.js', () => ({
      getMeetings: async () => ({
        Year: 2024,
        Meetings: [meeting],
      }),
    }));
    vi.doMock('./tui/screens/MeetingPicker.js', () => ({
      MeetingPicker: ({
        meetings,
        onSelect,
      }: {
        meetings: Meeting[];
        onSelect: (selectedMeeting: Meeting) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meetings[0] as Meeting);
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
        onSelect: (selectedSession: Session) => void;
      }) => {
        React.useEffect(() => {
          void onSelect(meeting.Sessions[0] as Session);
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
    vi.doMock('./tui/screens/EngineerChat.js', () => ({
      EngineerChat: ({
        messages,
      }: {
        messages: { role: 'user' | 'assistant'; content: string }[];
      }) =>
        React.createElement(
          Text,
          null,
          messages
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n'),
        ),
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () => (app.lastFrame() ?? '').includes('assistant: Quick summary:'),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(app.lastFrame() ?? '').not.toContain(
      'Resume prior engineer transcript',
    );
    app.unmount();
  });
});
