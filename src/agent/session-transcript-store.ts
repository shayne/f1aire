import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptEvent } from './transcript-events.js';

type SaveTranscriptEventsArgs = {
  dataDir: string;
  sessionKey: string;
  events: TranscriptEvent[];
  mkdir?: typeof fs.mkdir;
  rename?: typeof fs.rename;
  unlink?: typeof fs.unlink;
  writeFile?: typeof fs.writeFile;
};

type LoadTranscriptEventsArgs = {
  dataDir: string;
  sessionKey: string;
  readFile?: typeof fs.readFile;
};

function getTranscriptPath({
  dataDir,
  sessionKey,
}: {
  dataDir: string;
  sessionKey: string;
}): string {
  return path.join(dataDir, 'transcripts', `${sessionKey}.json`);
}

export function getTranscriptSessionKey({
  year,
  meetingKey,
  sessionKey,
}: {
  year: number;
  meetingKey: number;
  sessionKey: number;
}): string {
  return `${year}-${meetingKey}-${sessionKey}`;
}

function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== 'string' || typeof event.type !== 'string') {
    return false;
  }

  if (event.type === 'user-message') {
    return typeof event.text === 'string';
  }

  if (event.type === 'assistant-message') {
    return typeof event.text === 'string' && typeof event.streaming === 'boolean';
  }

  if (event.type === 'tool-call') {
    return (
      typeof event.toolName === 'string' && typeof event.label === 'string'
    );
  }

  if (event.type === 'tool-result') {
    return (
      typeof event.toolName === 'string' &&
      typeof event.label === 'string' &&
      (event.error === undefined || typeof event.error === 'string')
    );
  }

  return false;
}

export async function saveTranscriptEvents({
  dataDir,
  events,
  mkdir = fs.mkdir,
  rename = fs.rename,
  sessionKey,
  unlink = fs.unlink,
  writeFile = fs.writeFile,
}: SaveTranscriptEventsArgs): Promise<void> {
  const filePath = getTranscriptPath({ dataDir, sessionKey });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await writeFile(
      tempPath,
      `${JSON.stringify(events, null, 2)}\n`,
      'utf-8',
    );
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

export async function loadTranscriptEvents({
  dataDir,
  readFile = fs.readFile,
  sessionKey,
}: LoadTranscriptEventsArgs): Promise<TranscriptEvent[]> {
  try {
    const raw = await readFile(getTranscriptPath({ dataDir, sessionKey }), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isTranscriptEvent)) {
      return [];
    }
    return parsed;
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }
}
