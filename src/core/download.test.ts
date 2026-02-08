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
      if (url.endsWith('Index.json')) {
        return new Response(
          '\uFEFF' +
            JSON.stringify({
              Feeds: {
                SessionInfo: { KeyFramePath: 'SessionInfo.json', StreamPath: 'SessionInfo.jsonStream' },
                Heartbeat: { KeyFramePath: 'Heartbeat.json', StreamPath: 'Heartbeat.jsonStream' },
                TimingData: { KeyFramePath: 'TimingData.json', StreamPath: 'TimingData.jsonStream' },
              },
            }),
        );
      }
      if (url.endsWith('SessionInfo.jsonStream')) {
        return new Response('\uFEFF00:00:00.000{"SessionInfo":1}\n');
      }
      if (url.endsWith('Heartbeat.jsonStream')) {
        return new Response('\uFEFF00:00:05.000{"Utc":"2024-01-01T00:00:10.000Z"}\n');
      }
      if (url.endsWith('SessionInfo.json')) {
        return new Response('\uFEFF{"SessionInfo":1}');
      }
      if (url.endsWith('Heartbeat.json')) {
        return new Response('\uFEFF{"Utc":"2024-01-01T00:00:10.000Z"}');
      }
      if (url.endsWith('TimingData.json')) {
        return new Response('\uFEFF{"Lines":{}}');
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
    const manifestPath = path.join(dir, '2024_Testville_Race', 'download.json');
    const keyframesPath = path.join(dir, '2024_Testville_Race', 'keyframes.json');
    expect(readFileSync(livePath, 'utf-8').length).toBeGreaterThan(0);
    expect(readFileSync(subscribePath, 'utf-8')).toContain('SessionInfo');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest).toMatchObject({
      version: 2,
      required: {
        SessionInfo: { ok: true },
        Heartbeat: { ok: true },
      },
    });
    expect(readFileSync(keyframesPath, 'utf-8')).toContain('TimingData');
    expect(Array.isArray(manifest.topicsAttempted)).toBe(true);
  });

  it('continues when optional topics are missing and records manifest failures', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'f1aire-'));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('Index.json')) {
        return new Response(
          JSON.stringify({
            Feeds: {
              SessionInfo: { KeyFramePath: 'SessionInfo.json', StreamPath: 'SessionInfo.jsonStream' },
              Heartbeat: { KeyFramePath: 'Heartbeat.json', StreamPath: 'Heartbeat.jsonStream' },
              PitStopSeries: { KeyFramePath: 'PitStopSeries.json', StreamPath: 'PitStopSeries.jsonStream' },
            },
          }),
        );
      }
      if (url.endsWith('SessionInfo.jsonStream')) {
        return new Response('00:00:00.000{"SessionInfo":1}\n');
      }
      if (url.endsWith('Heartbeat.jsonStream')) {
        return new Response('00:00:05.000{"Utc":"2024-01-01T00:00:10.000Z"}\n');
      }
      if (url.endsWith('PitStopSeries.jsonStream')) {
        return new Response('not found', { status: 404 });
      }
      if (url.endsWith('SessionInfo.json') || url.endsWith('Heartbeat.json') || url.endsWith('PitStopSeries.json')) {
        return new Response('{}');
      }
      return new Response('00:00:02.000{"Lines":{}}\n');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadSession({
        year: 2024,
        meeting,
        sessionKey: 10,
        dataRoot: dir,
      }),
    ).resolves.toBeTruthy();

    const manifestPath = path.join(dir, '2024_Testville_Race', 'download.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.topics.PitStopSeries).toMatchObject({ ok: false, statusCode: 404 });
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
