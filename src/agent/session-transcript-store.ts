import fs from 'node:fs/promises';
import path from 'node:path';
import type { TranscriptEvent } from './transcript-events.js';

function getTranscriptPath({
  dataDir,
  sessionKey,
}: {
  dataDir: string;
  sessionKey: string;
}): string {
  return path.join(dataDir, 'transcripts', `${sessionKey}.json`);
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
  sessionKey,
  events,
}: {
  dataDir: string;
  sessionKey: string;
  events: TranscriptEvent[];
}): Promise<void> {
  const filePath = getTranscriptPath({ dataDir, sessionKey });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(events, null, 2)}\n`, 'utf-8');
}

export async function loadTranscriptEvents({
  dataDir,
  sessionKey,
}: {
  dataDir: string;
  sessionKey: string;
}): Promise<TranscriptEvent[]> {
  try {
    const raw = await fs.readFile(
      getTranscriptPath({ dataDir, sessionKey }),
      'utf-8',
    );
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
    return [];
  }
}
