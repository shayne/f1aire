import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Meeting } from './types.js';
import { parseJsonStreamLines, parseOffsetMs } from './parse.js';

const RACE_TOPICS = [
  'Heartbeat',
  'CarData.z',
  'Position.z',
  'ExtrapolatedClock',
  'TopThree',
  'TimingStats',
  'TimingAppData',
  'WeatherData',
  'TrackStatus',
  'DriverList',
  'RaceControlMessages',
  'SessionData',
  'LapCount',
  'TimingData',
  'ChampionshipPrediction',
  'TeamRadio',
  'PitLaneTimeCollection',
  'PitStopSeries',
  'PitStop',
];

const NON_RACE_TOPICS = [
  'Heartbeat',
  'CarData.z',
  'Position.z',
  'ExtrapolatedClock',
  'TopThree',
  'TimingStats',
  'TimingAppData',
  'WeatherData',
  'TrackStatus',
  'DriverList',
  'RaceControlMessages',
  'SessionData',
  'TimingData',
  'TeamRadio',
  'PitLaneTimeCollection',
  'PitStopSeries',
  'PitStop',
];

export async function downloadSession(opts: {
  year: number;
  meeting: Meeting;
  sessionKey: number;
  dataRoot: string;
}): Promise<{ dir: string; lineCount: number }> {
  const session = opts.meeting.Sessions.find((s) => s.Key === opts.sessionKey);
  if (!session) throw new Error('Session not found');
  if (!session.Path) throw new Error('Session has no Path (not completed)');

  const folder = `${opts.year}_${opts.meeting.Location}_${session.Name}`.replace(
    /\s+/g,
    '_',
  );
  const dir = path.join(opts.dataRoot, folder);
  const livePath = path.join(dir, 'live.jsonl');
  const subscribePath = path.join(dir, 'subscribe.json');

  await fs.mkdir(dir, { recursive: true });
  if (await fileExists(livePath) || (await fileExists(subscribePath))) {
    throw new Error('Data files already exist');
  }

  const prefix = `https://livetiming.formula1.com/static/${session.Path}`;
  const sessionInfoRaw = await fetchStream(prefix, 'SessionInfo');
  const heartbeatRaw = await fetchStream(prefix, 'Heartbeat');

  const sessionInfo = parseFirstLine(sessionInfoRaw);
  const heartbeat = parseFirstLine(heartbeatRaw);
  const startUtc = extractStartUtc(heartbeat);
  const topics = session.Type === 'Race' ? RACE_TOPICS : NON_RACE_TOPICS;

  const all = (
    await Promise.all(
      topics.map(async (topic) => {
        const raw = await fetchStream(prefix, topic);
        return parseJsonStreamLines(topic, raw, startUtc);
      }),
    )
  ).flat();

  all.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  const lines = all.map((p) =>
    JSON.stringify({ type: p.type, json: p.json, dateTime: p.dateTime }),
  );

  await fs.writeFile(livePath, lines.join('\n'), 'utf-8');
  await fs.writeFile(
    subscribePath,
    JSON.stringify({ SessionInfo: sessionInfo.json, Heartbeat: heartbeat.json }),
    'utf-8',
  );

  return { dir, lineCount: lines.length };
}

async function fetchStream(prefix: string, topic: string): Promise<string> {
  const url = `${prefix}${topic}.jsonStream`;
  const res = await fetch(url, { headers: { 'User-Agent': 'f1aire/0.1.0' } });
  if (!res.ok) throw new Error(`Failed to download ${topic}`);
  return await res.text();
}

function parseFirstLine(raw: string): { json: any; offsetMs: number } {
  const line = raw.split('\n').find((x) => x.trim().length > 0);
  if (!line) throw new Error('Stream missing data');
  const offsetMs = parseOffsetMs(line.slice(0, 12));
  const json = JSON.parse(line.slice(12));
  return { json, offsetMs };
}

function extractStartUtc(heartbeat: { json: any; offsetMs: number }): Date {
  const utc = heartbeat.json.Utc ?? heartbeat.json.UtcTime ?? heartbeat.json.utc;
  if (!utc) throw new Error('Heartbeat missing UTC');
  const utcMs = Date.parse(utc);
  return new Date(utcMs - heartbeat.offsetMs);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
