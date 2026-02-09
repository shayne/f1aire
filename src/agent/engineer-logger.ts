import fs from 'node:fs';
import path from 'node:path';

type LoggerEvent = Record<string, unknown>;

type CreateEngineerLoggerOptions = {
  dataDir: string;
  now?: () => Date;
  mkdir?: typeof fs.promises.mkdir;
  appendFile?: typeof fs.promises.appendFile;
};

const BASE_EVENT_TYPES = new Set([
  'send-start',
  'send-finish',
  'stream-error',
  'engineer-init',
  'load-session-store',
  'timing-process',
  'event-loop-lag',
  'tool-timing',
  'tool-bridge',
  'pyodide-runtime',
]);
const STREAM_PART_TYPES = new Set([
  'tool-call',
  'tool-result',
  'tool-input-start',
  'tool-input-available',
  'tool-error',
  'error',
]);

function shouldLogEvent(event: LoggerEvent): boolean {
  const type = typeof event.type === 'string' ? event.type : '';
  if (!type) return false;
  if (type === 'stream-part') {
    const partType =
      typeof event.partType === 'string' ? event.partType : '';
    return STREAM_PART_TYPES.has(partType);
  }
  return BASE_EVENT_TYPES.has(type);
}

export function createEngineerLogger({
  dataDir,
  now = () => new Date(),
  mkdir = fs.promises.mkdir,
  appendFile = fs.promises.appendFile,
}: CreateEngineerLoggerOptions) {
  const logDir = path.join(dataDir, 'logs');
  const logPath = path.join(logDir, 'ai-engineer.log');

  const logger = async (event: LoggerEvent) => {
    if (!shouldLogEvent(event)) return;
    const payload = {
      time: now().toISOString(),
      ...event,
    };
    const line = `${JSON.stringify(payload)}\n`;
    try {
      await mkdir(logDir, { recursive: true });
      await appendFile(logPath, line, 'utf-8');
    } catch {
      // Ignore filesystem errors to avoid breaking the app flow.
    }
  };

  return { logPath, logger };
}
