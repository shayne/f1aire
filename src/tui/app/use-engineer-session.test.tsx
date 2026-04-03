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
});
