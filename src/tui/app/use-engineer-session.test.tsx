import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import React, { useEffect, useRef, useState } from 'react';
import { Text } from '#ink';
import { renderTui } from '#ink/testing';
import type { TranscriptEvent } from '../../agent/transcript-events.js';
import type { Meeting, Session } from '../../core/types.js';
import type { Screen } from '../navigation.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

const meeting: Meeting = {
  Key: 24,
  Name: 'British Grand Prix',
  Location: 'Silverstone',
  Sessions: [],
};

const session: Session = {
  Key: 10,
  Name: 'Race',
  Type: 'Race',
  StartDate: '2025-07-06T14:00:00Z',
  EndDate: '2025-07-06T16:00:00Z',
  GmtOffset: '+00:00',
  Path: '2025/Silverstone/Race/',
};

type HarnessOptions = {
  dir: string;
  sendPrompt?: string;
};

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

async function writeSessionFixture(dir: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'subscribe.json'), '{}\n', 'utf-8');
  await writeFile(path.join(dir, 'live.jsonl'), '', 'utf-8');
}

describe('useEngineerSession', () => {
  it('configures the OpenAI provider with ChatGPT OAuth when ChatGPT auth is selected', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-chatgpt-'),
    );
    const dir = path.join(dataRoot, 'download');
    await writeSessionFixture(dir);
    process.env.XDG_DATA_HOME = dataRoot;

    const createOpenAI = vi.fn(() => () => ({}));
    const createEngineerSession = vi.fn(({ initialTranscript }) => ({
      getTranscriptEvents: () => initialTranscript,
      send: vi.fn(async function* () {}),
    }));

    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI,
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: false,
          storedKeyPresent: false,
          inUse: 'none',
        },
        resolveApiKeyForUse: async () => null,
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          {
            kind: 'chatgpt',
            accessToken: 'chatgpt-access-token',
            refreshToken: 'refresh-token',
            expiresAt: Date.now() + 3600_000,
            accountId: 'acct-chatgpt',
          } as any,
        );
      }, [dir]);

      return <Text>{screen.name}</Text>;
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(() => (app.lastFrame() ?? '').includes('engineer'), {
      debug: () => app.lastFrame() ?? '',
    });

    expect(createOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'f1aire-chatgpt-oauth-dummy-key',
        baseURL: 'https://chatgpt.com/backend-api/codex',
        fetch: expect.any(Function),
      }),
    );
    expect(createEngineerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        system: undefined,
        providerOptions: {
          openai: {
            instructions: 'test prompt',
            store: false,
            systemMessageMode: 'remove',
          },
        },
      }),
    );

    app.unmount();
  });

  it('hydrates chat messages from persisted transcript events before entering engineer mode', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-'),
    );
    const dir = path.join(dataRoot, 'download');
    const storedTranscript: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Summarize the opening stint.',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Norris held track position after lap 12.',
        streaming: false,
      },
    ];
    await writeSessionFixture(dir);
    await mkdir(path.join(dataRoot, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    await writeFile(
      path.join(dataRoot, 'f1aire', 'data', 'transcripts', '2025-24-10.json'),
      `${JSON.stringify(storedTranscript, null, 2)}\n`,
      'utf-8',
    );
    process.env.XDG_DATA_HOME = dataRoot;

    const createEngineerSession = vi.fn(({ initialTranscript }) => ({
      getTranscriptEvents: () => initialTranscript,
      send: vi.fn(async function* () {}),
    }));
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
        );
      }, [dir]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return <Text>{`${screen.name}\n${renderedMessages}`}</Text>;
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('engineer') &&
        (app.lastFrame() ?? '').includes(
          'assistant: Norris held track position after lap 12.',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(createEngineerSession).toHaveBeenCalledWith(
      expect.objectContaining({
        initialTranscript: storedTranscript,
      }),
    );
    expect(app.lastFrame() ?? '').toContain(
      'user: Summarize the opening stint.',
    );
    app.unmount();
  });

  it('starts a fresh engineer transcript and overwrites prior history when resume is disabled', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-fresh-'),
    );
    const dir = path.join(dataRoot, 'download');
    await writeSessionFixture(dir);
    await mkdir(path.join(dataRoot, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    await writeFile(
      path.join(dataRoot, 'f1aire', 'data', 'transcripts', '2025-24-10.json'),
      `${JSON.stringify(
        [
          {
            id: 'assistant-1',
            type: 'assistant-message',
            text: 'Old transcript that should be replaced.',
            streaming: false,
          },
        ],
        null,
        2,
      )}\n`,
      'utf-8',
    );
    process.env.XDG_DATA_HOME = dataRoot;

    const createEngineerSession = vi.fn(({ initialTranscript }) => ({
      getTranscriptEvents: () => initialTranscript,
      send: vi.fn(async function* () {}),
    }));
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
          { resumeTranscript: false },
        );
      }, [dir]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return <Text>{`${screen.name}\n${renderedMessages}`}</Text>;
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('engineer') &&
        (app.lastFrame() ?? '').includes('assistant: Quick summary:'),
      { debug: () => app.lastFrame() ?? '' },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('- Winner: unavailable');
    expect(frame).not.toContain('Old transcript that should be replaced.');

    await expect(
      readFile(
        path.join(dataRoot, 'f1aire', 'data', 'transcripts', '2025-24-10.json'),
        'utf-8',
      ).then((raw) => JSON.parse(raw)),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'assistant-message',
          text: expect.stringContaining('Quick summary:'),
        }),
      ]),
    );

    app.unmount();
  });

  it('saves transcript events after a successful user turn', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-'),
    );
    const dir = path.join(dataRoot, 'download');
    const savedTranscript: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Compare tyre degradation.',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Hamilton managed the medium stint best.',
        streaming: false,
      },
    ];
    await writeSessionFixture(dir);
    process.env.XDG_DATA_HOME = dataRoot;

    const createEngineerSession = vi.fn(() => ({
      getTranscriptEvents: () => savedTranscript,
      send: vi.fn(async function* () {
        yield 'Hamilton managed the medium stint best.';
      }),
    }));
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir, sendPrompt }: HarnessOptions) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const sentRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
        );
      }, [dir]);

      useEffect(() => {
        if (!sendPrompt || screen.name !== 'engineer' || sentRef.current) {
          return;
        }
        sentRef.current = true;
        void engineer.handleSend(sendPrompt);
      }, [screen.name, sendPrompt]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return (
        <Text>{`${screen.name}\n${renderedMessages}\n${engineer.streamingText}`}</Text>
      );
    }

    const app = await renderTui(
      <Harness dir={dir} sendPrompt="Compare tyre degradation." />,
    );

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes(
          'assistant: Hamilton managed the medium stint best.',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    await expect(
      readFile(
        path.join(dataRoot, 'f1aire', 'data', 'transcripts', '2025-24-10.json'),
        'utf-8',
      ).then((raw) => JSON.parse(raw)),
    ).resolves.toEqual(savedTranscript);

    app.unmount();
  });

  it('waits for transcript persistence before appending the final assistant message', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-'),
    );
    const dir = path.join(dataRoot, 'download');
    await writeSessionFixture(dir);
    process.env.XDG_DATA_HOME = dataRoot;

    let resolveSave: (() => void) | null = null;
    const saveTranscriptEvents = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    vi.doMock('../../agent/session-transcript-store.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../agent/session-transcript-store.js')
      >('../../agent/session-transcript-store.js');
      return {
        ...actual,
        saveTranscriptEvents,
      };
    });

    const createEngineerSession = vi.fn(() => ({
      getTranscriptEvents: () => [
        {
          id: 'user-1',
          type: 'user-message',
          text: 'Compare tyre degradation.',
        },
        {
          id: 'assistant-1',
          type: 'assistant-message',
          text: 'Mercedes kept rear temps stable.',
          streaming: false,
        },
      ],
      send: vi.fn(async function* () {
        yield 'Mercedes kept rear temps stable.';
      }),
    }));
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const sentRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
        );
      }, [dir]);

      useEffect(() => {
        if (screen.name !== 'engineer' || sentRef.current) return;
        sentRef.current = true;
        void engineer.handleSend('Compare tyre degradation.');
      }, [screen.name]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return (
        <Text>{`${screen.name}\n${renderedMessages}\nstream: ${engineer.streamingText}`}</Text>
      );
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(
      () =>
        saveTranscriptEvents.mock.calls.length > 0 &&
        (app.lastFrame() ?? '').includes(
          'stream: Mercedes kept rear temps stable.',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(app.lastFrame() ?? '').not.toContain(
      'assistant: Mercedes kept rear temps stable.',
    );

    resolveSave?.();

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes(
          'assistant: Mercedes kept rear temps stable.',
        ),
      { debug: () => app.lastFrame() ?? '' },
    );

    app.unmount();
  });

  it('cancels the active engineer turn and keeps any streamed partial text', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-cancel-'),
    );
    const dir = path.join(dataRoot, 'download');
    await writeSessionFixture(dir);
    process.env.XDG_DATA_HOME = dataRoot;

    let resolveSend: (() => void) | null = null;
    const cancel = vi.fn(() => {
      resolveSend?.();
    });
    const createEngineerSession = vi.fn(() => ({
      cancel,
      getTranscriptEvents: () => [
        {
          id: 'user-1',
          type: 'user-message',
          text: 'Compare tyre degradation.',
        },
        {
          id: 'assistant-1',
          type: 'assistant-message',
          text: 'Partial answer',
          streaming: false,
        },
      ],
      send: vi.fn(async function* () {
        const done = new Promise<void>((resolve) => {
          resolveSend = resolve;
        });
        yield 'Partial answer';
        await done;
      }),
    }));
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/session-transcript-store.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../agent/session-transcript-store.js')
      >('../../agent/session-transcript-store.js');
      return {
        ...actual,
        saveTranscriptEvents: vi.fn(async () => {}),
      };
    });
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const sentRef = useRef(false);
      const interruptedRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
        );
      }, [dir]);

      useEffect(() => {
        if (screen.name !== 'engineer' || sentRef.current) return;
        sentRef.current = true;
        void engineer.handleSend('Compare tyre degradation.');
      }, [screen.name]);

      useEffect(() => {
        if (
          !engineer.isStreaming ||
          engineer.streamingText !== 'Partial answer' ||
          interruptedRef.current
        ) {
          return;
        }
        interruptedRef.current = true;
        engineer.interruptEngineerTurn();
      }, [
        engineer.interruptEngineerTurn,
        engineer.isStreaming,
        engineer.streamingText,
      ]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return (
        <Text>{`${screen.name}\nstreaming=${String(engineer.isStreaming)}\nstream: ${engineer.streamingText}\n${renderedMessages}`}</Text>
      );
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('streaming=false') &&
        (app.lastFrame() ?? '').includes('assistant: Partial answer'),
      { debug: () => app.lastFrame() ?? '' },
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    app.unmount();
  });

  it('does not append an empty assistant message when a turn is cancelled before the first token', async () => {
    const dataRoot = await mkdtemp(
      path.join(os.tmpdir(), 'f1aire-engineer-session-cancel-empty-'),
    );
    const dir = path.join(dataRoot, 'download');
    const storedTranscript: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Existing transcript context.',
      },
    ];
    await writeSessionFixture(dir);
    await mkdir(path.join(dataRoot, 'f1aire', 'data', 'transcripts'), {
      recursive: true,
    });
    await writeFile(
      path.join(dataRoot, 'f1aire', 'data', 'transcripts', '2025-24-10.json'),
      `${JSON.stringify(storedTranscript, null, 2)}\n`,
      'utf-8',
    );
    process.env.XDG_DATA_HOME = dataRoot;

    let resolveSend: (() => void) | null = null;
    let cancel: ReturnType<typeof vi.fn> | null = null;
    const createEngineerSession = vi.fn(({ initialTranscript, onEvent }) => {
      cancel = vi.fn(() => {
        onEvent?.({ type: 'send-cancel' });
        resolveSend?.();
      });

      return {
        cancel,
        getTranscriptEvents: () => [
          ...initialTranscript,
          {
            id: 'user-2',
            type: 'user-message',
            text: 'Cancel before any output.',
          },
        ],
        send: vi.fn(async function* () {
          await new Promise<void>((resolve) => {
            resolveSend = resolve;
          });
          yield* [];
        }),
      };
    });
    vi.doMock('@ai-sdk/openai', () => ({
      createOpenAI: () => () => ({}),
    }));
    vi.doMock('../../agent/engineer.js', () => ({
      createEngineerSession,
    }));
    vi.doMock('../../agent/engineer-logger.js', () => ({
      createEngineerLogger: () => ({ logger: vi.fn() }),
    }));
    vi.doMock('../../agent/prompt.js', () => ({ systemPrompt: 'test prompt' }));
    vi.doMock('../../agent/session-transcript-store.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../agent/session-transcript-store.js')
      >('../../agent/session-transcript-store.js');
      return {
        ...actual,
        saveTranscriptEvents: vi.fn(async () => {}),
      };
    });
    vi.doMock('../../agent/tools.js', () => ({ makeTools: () => ({}) }));

    const { useEngineerSession } = await import('./use-engineer-session.js');

    function Harness({ dir }: { dir: string }) {
      const [screen, setScreen] = useState<Screen>({ name: 'season' });
      const startedRef = useRef(false);
      const sentRef = useRef(false);
      const interruptedRef = useRef(false);
      const engineer = useEngineerSession({
        keyStatus: {
          envKeyPresent: true,
          storedKeyPresent: false,
          inUse: 'env',
        },
        resolveApiKeyForUse: async () => 'test-key',
        screenName: screen.name,
        setScreen,
        storedApiKey: null,
      });

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        void engineer.startEngineer(
          {
            year: 2025,
            meetings: [meeting],
            meeting,
            session,
            dir,
          },
          'test-key',
        );
      }, [dir]);

      useEffect(() => {
        if (screen.name !== 'engineer' || sentRef.current) return;
        sentRef.current = true;
        void engineer.handleSend('Cancel before any output.');
      }, [screen.name]);

      useEffect(() => {
        if (!engineer.isStreaming || interruptedRef.current) return;
        interruptedRef.current = true;
        engineer.interruptEngineerTurn();
      }, [engineer.interruptEngineerTurn, engineer.isStreaming]);

      const renderedMessages = engineer.messages
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

      return (
        <Text>{`${screen.name}\nstreaming=${String(engineer.isStreaming)}\nactivity=${engineer.activity.at(-1) ?? ''}\n${renderedMessages}`}</Text>
      );
    }

    const app = await renderTui(<Harness dir={dir} />);

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('streaming=false') &&
        (app.lastFrame() ?? '').includes('activity=Cancelled'),
      { debug: () => app.lastFrame() ?? '' },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('user: Existing transcript context.');
    expect(frame).toContain('user: Cancel before any output.');
    expect(frame).not.toContain('assistant:');
    expect(cancel).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
