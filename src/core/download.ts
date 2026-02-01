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

const USER_AGENT = `f1aire/0.1.0`;
const FETCH_TIMEOUT_MS = 10_000;

export async function downloadSession(opts: {
  year: number;
  meeting: Meeting;
  sessionKey: number;
  dataRoot: string;
  allowExisting?: boolean;
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
  const liveExists = await fileExists(livePath);
  const subscribeExists = await fileExists(subscribePath);
  if (liveExists && subscribeExists) {
    if (opts.allowExisting) return { dir, lineCount: 0 };
    throw new Error('Data files already exist');
  }
  if (liveExists || subscribeExists) {
    throw new Error('Partial data already exists; delete the folder to re-download');
  }

  const normalizedPath = session.Path.startsWith('/')
    ? session.Path.slice(1)
    : session.Path;
  const pathWithSlash = normalizedPath.endsWith('/')
    ? normalizedPath
    : `${normalizedPath}/`;
  const prefix = `https://livetiming.formula1.com/static/${pathWithSlash}`;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Failed to download ${topic}: ${res.status}`);
    return await res.text();
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Timed out downloading ${topic} after ${FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
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
  if (Number.isNaN(utcMs)) {
    throw new Error(`Heartbeat UTC timestamp is invalid: ${utc}`);
  }
  return new Date(utcMs - heartbeat.offsetMs);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
