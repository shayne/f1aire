import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createEngineerLogger } from './engineer-logger.js';

describe('createEngineerLogger', () => {
  it('writes jsonl for selected events', async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const now = () => new Date('2026-02-01T00:00:00.000Z');

    const dataDir = path.join('/data');
    const logDir = path.join(dataDir, 'logs');
    const expectedLogPath = path.join(logDir, 'ai-engineer.log');
    const { logPath, logger } = createEngineerLogger({
      dataDir,
      appendFile,
      mkdir,
      now,
    });

    await logger({ type: 'send-start', inputLength: 3 });

    expect(logPath).toBe(expectedLogPath);
    expect(mkdir).toHaveBeenCalledWith(logDir, { recursive: true });
    expect(appendFile).toHaveBeenCalledWith(
      expectedLogPath,
      expect.stringContaining('"type":"send-start"'),
      'utf-8',
    );
    expect(appendFile).toHaveBeenCalledWith(
      expectedLogPath,
      expect.stringContaining('"time":"2026-02-01T00:00:00.000Z"'),
      'utf-8',
    );
  });

  it('ignores non-essential stream parts', async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const dataDir = path.join('/data');
    const { logger } = createEngineerLogger({
      dataDir,
      appendFile,
      mkdir,
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    await logger({ type: 'stream-part', partType: 'start-step' });

    expect(appendFile).not.toHaveBeenCalled();
  });

  it('logs performance events', async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const dataDir = path.join('/data');
    const { logger } = createEngineerLogger({
      dataDir,
      appendFile,
      mkdir,
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    await logger({ type: 'event-loop-lag', lagMs: 312, intervalMs: 100 });

    expect(appendFile).toHaveBeenCalledWith(
      path.join(dataDir, 'logs', 'ai-engineer.log'),
      expect.stringContaining('"type":"event-loop-lag"'),
      'utf-8',
    );
  });

  it('logs pyodide runtime diagnostics', async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const mkdir = vi.fn().mockResolvedValue(undefined);

    const dataDir = path.join('/data');
    const { logger } = createEngineerLogger({
      dataDir,
      appendFile,
      mkdir,
      now: () => new Date('2026-02-01T00:00:00.000Z'),
    });

    await logger({
      type: 'pyodide-runtime',
      phase: 'fatal-detected',
      error: 'Pyodide already fatally failed and can no longer be used',
    });

    expect(appendFile).toHaveBeenCalledWith(
      path.join(dataDir, 'logs', 'ai-engineer.log'),
      expect.stringContaining('"type":"pyodide-runtime"'),
      'utf-8',
    );
    expect(appendFile).toHaveBeenCalledWith(
      path.join(dataDir, 'logs', 'ai-engineer.log'),
      expect.stringContaining('"phase":"fatal-detected"'),
      'utf-8',
    );
  });
});
