import { promises as fs } from 'node:fs';
import path from 'node:path';

type RawPoint = { type: string; json: any; dateTime: Date };

type TopicView = {
  latest: RawPoint | null;
  timeline: (from?: Date, to?: Date) => RawPoint[];
};

export type SessionStore = {
  raw: { subscribe: any; live: RawPoint[]; download: any | null; keyframes: any | null };
  topic: (name: string) => TopicView;
};

export async function loadSessionStore(dir: string): Promise<SessionStore> {
  const subscribeRaw = JSON.parse(
    await fs.readFile(path.join(dir, 'subscribe.json'), 'utf-8'),
  );
  let downloadRaw: any | null = null;
  try {
    downloadRaw = JSON.parse(
      await fs.readFile(path.join(dir, 'download.json'), 'utf-8'),
    );
  } catch {
    downloadRaw = null;
  }
  let keyframesRaw: any | null = null;
  try {
    keyframesRaw = JSON.parse(
      await fs.readFile(path.join(dir, 'keyframes.json'), 'utf-8'),
    );
  } catch {
    keyframesRaw = null;
  }
  const liveLines = (await fs.readFile(path.join(dir, 'live.jsonl'), 'utf-8'))
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parsed = JSON.parse(line) as { type: string; json: any; dateTime: string };
      return { ...parsed, dateTime: new Date(parsed.dateTime) } as RawPoint;
    });

  const byTopic = new Map<string, RawPoint[]>();
  for (const p of liveLines) {
    const arr = byTopic.get(p.type) ?? [];
    arr.push(p);
    byTopic.set(p.type, arr);
  }
  for (const arr of byTopic.values()) {
    arr.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }

  return {
    raw: { subscribe: subscribeRaw, live: liveLines, download: downloadRaw, keyframes: keyframesRaw },
    topic: (name: string) => {
      const arr = byTopic.get(name) ?? [];
      return {
        latest: arr.length > 0 ? arr[arr.length - 1] : null,
        timeline: (from?: Date, to?: Date) =>
          arr.filter((p) => (!from || p.dateTime >= from) && (!to || p.dateTime <= to)),
      };
    },
  };
}
