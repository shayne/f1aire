import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { loadSessionStore } from './session-store.js';

const base = path.join(tmpdir(), `f1aire-store-${Date.now()}`);
mkdirSync(base, { recursive: true });
writeFileSync(
  path.join(base, 'subscribe.json'),
  JSON.stringify({ SessionInfo: { Name: 'Test' }, Heartbeat: { Utc: '2025-01-01T00:00:00Z' } }),
  'utf-8',
);
writeFileSync(
  path.join(base, 'live.jsonl'),
  [
    JSON.stringify({ type: 'DriverList', json: { '4': { FullName: 'Lando Norris' } }, dateTime: '2025-01-01T00:00:01Z' }),
    JSON.stringify({ type: 'TimingData', json: { Lines: { '4': { Position: '1' } } }, dateTime: '2025-01-01T00:00:02Z' })
  ].join('\n'),
  'utf-8',
);

describe('SessionStore', () => {
  it('loads raw files and exposes topic latest + timeline', async () => {
    const store = await loadSessionStore(base);
    expect(store.raw.subscribe.SessionInfo.Name).toBe('Test');
    expect(store.raw.keyframes).toBeNull();
    expect(store.topic('DriverList').latest?.json).toHaveProperty('4');
    const timeline = store.topic('TimingData').timeline();
    expect(timeline.length).toBe(1);
  });
});
