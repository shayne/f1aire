import {
  mkdir,
  mkdtemp,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadTranscriptEvents,
  saveTranscriptEvents,
} from './session-transcript-store.js';
import type { TranscriptEvent } from './transcript-events.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session-transcript-store', () => {
  it('round-trips transcript events for one session', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));
    const events: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'What was Ferrari long-run degradation?',
      },
      {
        id: 'assistant-1',
        type: 'assistant-message',
        text: 'Leclerc degraded by roughly 0.08s/lap over the stint.',
        streaming: false,
      },
      {
        id: 'tool-1',
        type: 'tool-call',
        toolName: 'compare_lap_times',
        label: 'Running tool: compare_lap_times',
      },
      {
        id: 'tool-1-result',
        type: 'tool-result',
        toolName: 'compare_lap_times',
        label: 'Processing result: compare_lap_times',
      },
    ];

    await saveTranscriptEvents({
      dataDir,
      sessionKey: '2025-24-10',
      events,
    });

    await expect(
      loadTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
      }),
    ).resolves.toEqual(events);

    const raw = await readFile(
      path.join(dataDir, 'transcripts', '2025-24-10.json'),
      'utf-8',
    );
    expect(raw).toContain('Ferrari long-run degradation?');
  });

  it('returns an empty transcript when no file exists', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));

    await expect(
      loadTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
      }),
    ).resolves.toEqual([]);
  });

  it('returns an empty transcript when a stored file is malformed', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));
    const filePath = path.join(dataDir, 'transcripts', '2025-24-10.json');
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '{"broken": ', 'utf-8');

    await expect(
      loadTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
      }),
    ).resolves.toEqual([]);
  });

  it('preserves the previous transcript if a temp-file rename fails', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));
    const previousEvents: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Keep this transcript.',
      },
    ];
    const nextEvents: TranscriptEvent[] = [
      {
        id: 'user-1',
        type: 'user-message',
        text: 'Replace with new transcript.',
      },
    ];

    await saveTranscriptEvents({
      dataDir,
      sessionKey: '2025-24-10',
      events: previousEvents,
    });

    await expect(
      saveTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
        events: nextEvents,
        rename: vi.fn(async () => {
          throw Object.assign(new Error('rename failed'), { code: 'EIO' });
        }),
        unlink,
        writeFile,
      }),
    ).rejects.toThrow('rename failed');

    await expect(
      loadTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
      }),
    ).resolves.toEqual(previousEvents);
  });

  it('surfaces unexpected filesystem errors instead of flattening them to empty history', async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'f1aire-transcript-'));
    await expect(
      loadTranscriptEvents({
        dataDir,
        sessionKey: '2025-24-10',
        readFile: vi.fn(async () => {
          throw Object.assign(new Error('permission denied'), {
            code: 'EACCES',
          });
        }),
      }),
    ).rejects.toThrow('permission denied');
  });
});
