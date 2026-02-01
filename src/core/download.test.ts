import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadSession } from './download.js';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const meeting = {
  Key: 1,
  Name: 'Test GP',
  Location: 'Testville',
  Sessions: [
    { Key: 10, Name: 'Race', Type: 'Race', Path: '2024/test/', StartDate: '', EndDate: '', GmtOffset: '' },
  ],
};

describe('downloadSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes live.jsonl and subscribe.json', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'f1aire-'));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('SessionInfo.jsonStream')) {
        return new Response('00:00:00.000{"SessionInfo":1}\n');
      }
      if (url.endsWith('Heartbeat.jsonStream')) {
        return new Response('00:00:05.000{"Utc":"2024-01-01T00:00:10.000Z"}\n');
      }
      return new Response('00:00:02.000{"Lines":{}}\n');
    });
    vi.stubGlobal('fetch', fetchMock);

    await downloadSession({
      year: 2024,
      meeting,
      sessionKey: 10,
      dataRoot: dir,
    });

    const livePath = path.join(dir, '2024_Testville_Race', 'live.jsonl');
    const subscribePath = path.join(dir, '2024_Testville_Race', 'subscribe.json');
    expect(readFileSync(livePath, 'utf-8').length).toBeGreaterThan(0);
    expect(readFileSync(subscribePath, 'utf-8')).toContain('SessionInfo');
  });

  it('reuses existing data when allowExisting is true', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'f1aire-'));
    const sessionDir = path.join(dir, '2024_Testville_Race');
    const livePath = path.join(sessionDir, 'live.jsonl');
    const subscribePath = path.join(sessionDir, 'subscribe.json');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(livePath, '{"type":"DriverList","json":{},"dateTime":"2024-01-01T00:00:00.000Z"}');
    writeFileSync(subscribePath, JSON.stringify({ SessionInfo: {}, Heartbeat: {} }));

    const result = await downloadSession({
      year: 2024,
      meeting,
      sessionKey: 10,
      dataRoot: dir,
      allowExisting: true,
    });

    expect(result.dir).toBe(sessionDir);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
