import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Meeting } from './types.js';
import { parseJsonStreamLines, parseOffsetMs } from './parse.js';
import { getStreamTopicsForSessionType } from './topic-registry.js';

const USER_AGENT = `f1aire/0.1.0`;
const FETCH_TIMEOUT_MS = 10_000;

type DownloadTopicResult = {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  bytes: number | null;
  points: number | null;
  invalidLines: number | null;
};

type DownloadManifestV1 = {
  version: 1;
  createdAt: string;
  userAgent: string;
  year: number;
  meeting: { key: number; name: string; location: string };
  session: { key: number; name: string; type: string; path: string };
  prefix: string;
  startUtc: string;
  heartbeat: { utc: string; offsetMs: number };
  required: {
    SessionInfo: DownloadTopicResult;
    Heartbeat: DownloadTopicResult;
  };
  topicsAttempted: string[];
  topics: Record<string, DownloadTopicResult>;
};

type DownloadManifestV2 = {
  version: 2;
  createdAt: string;
  userAgent: string;
  year: number;
  meeting: { key: number; name: string; location: string };
  session: { key: number; name: string; type: string; path: string };
  prefix: string;
  sessionIndex: {
    ok: boolean;
    statusCode: number | null;
    error: string | null;
    bytes: number | null;
    feeds: Record<string, { keyFramePath: string | null; streamPath: string | null }>;
  };
  startUtc: string;
  heartbeat: { utc: string; offsetMs: number };
  required: {
    SessionInfo: DownloadTopicResult;
    Heartbeat: DownloadTopicResult;
  };
  topicsAttempted: string[];
  topics: Record<string, DownloadTopicResult>;
  keyframes: Record<string, DownloadTopicResult>;
};

type SessionIndexPayload = {
  Feeds?: Record<string, { KeyFramePath?: unknown; StreamPath?: unknown }>;
};

type FeedDef = {
  name: string;
  keyFramePath: string | null;
  streamPath: string | null;
};

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
  const manifest: DownloadManifestV2 = {
    version: 2,
    createdAt: new Date().toISOString(),
    userAgent: USER_AGENT,
    year: opts.year,
    meeting: { key: opts.meeting.Key, name: opts.meeting.Name, location: opts.meeting.Location },
    session: { key: session.Key, name: session.Name, type: session.Type, path: session.Path },
    prefix,
    sessionIndex: {
      ok: false,
      statusCode: null,
      error: null,
      bytes: null,
      feeds: {},
    },
    startUtc: '',
    heartbeat: { utc: '', offsetMs: 0 },
    required: {
      SessionInfo: {
        ok: false,
        statusCode: null,
        error: null,
        bytes: null,
        points: null,
        invalidLines: null,
      },
      Heartbeat: {
        ok: false,
        statusCode: null,
        error: null,
        bytes: null,
        points: null,
        invalidLines: null,
      },
    },
    topicsAttempted: [],
    topics: {},
    keyframes: {},
  };

  const sessionIndexFetch = await fetchUrlWithMeta(`${prefix}Index.json`);
  let feeds: FeedDef[] | null = null;
  if (!sessionIndexFetch.ok) {
    manifest.sessionIndex = {
      ok: false,
      statusCode: sessionIndexFetch.statusCode ?? null,
      error: sessionIndexFetch.error,
      bytes: null,
      feeds: {},
    };
  } else {
    manifest.sessionIndex.ok = true;
    manifest.sessionIndex.statusCode = sessionIndexFetch.statusCode;
    manifest.sessionIndex.error = null;
    manifest.sessionIndex.bytes = sessionIndexFetch.bytes;
    try {
      const parsed = parseJsonText(sessionIndexFetch.raw) as SessionIndexPayload;
      if (isSessionIndexPayload(parsed)) {
        feeds = extractFeeds(parsed);
        if (feeds.length === 0) {
          feeds = null;
          manifest.sessionIndex.ok = false;
          manifest.sessionIndex.error = 'Session Index.json contained no feeds';
        }
        if (feeds) {
          for (const feed of feeds) {
            manifest.sessionIndex.feeds[feed.name] = {
              keyFramePath: feed.keyFramePath,
              streamPath: feed.streamPath,
            };
          }
        }
      } else {
        manifest.sessionIndex.ok = false;
        manifest.sessionIndex.error = 'Invalid session Index.json payload (missing Feeds map)';
      }
    } catch (err) {
      manifest.sessionIndex.ok = false;
      manifest.sessionIndex.error = err instanceof Error ? err.message : String(err);
    }
  }

  // Fallback to static topic registry if per-session index isn't available.
  if (!feeds) {
    const topics = getStreamTopicsForSessionType(session.Type);
    feeds = topics.map((topic) => ({
      name: topic,
      keyFramePath: `${topic}.json`,
      streamPath: `${topic}.jsonStream`,
    }));
  }

  const feedByName = new Map(feeds.map((feed) => [feed.name, feed]));
  const sessionInfoStream = feedByName.get('SessionInfo')?.streamPath ?? 'SessionInfo.jsonStream';
  const heartbeatStream = feedByName.get('Heartbeat')?.streamPath ?? 'Heartbeat.jsonStream';

  const sessionInfoFetch = await fetchUrlWithMeta(`${prefix}${sessionInfoStream}`);
  if (!sessionInfoFetch.ok) {
    manifest.required.SessionInfo = {
      ok: false,
      statusCode: sessionInfoFetch.statusCode ?? null,
      error: sessionInfoFetch.error,
      bytes: null,
      points: null,
      invalidLines: null,
    };
    await safeWriteManifest(dir, manifest);
    throw new Error(
      sessionInfoFetch.statusCode
        ? `Failed to download SessionInfo: ${sessionInfoFetch.statusCode}`
        : `Failed to download SessionInfo: ${sessionInfoFetch.error}`,
    );
  }
  manifest.required.SessionInfo = {
    ok: true,
    statusCode: sessionInfoFetch.statusCode,
    error: null,
    bytes: sessionInfoFetch.bytes,
    points: null,
    invalidLines: null,
  };

  const heartbeatFetch = await fetchUrlWithMeta(`${prefix}${heartbeatStream}`);
  if (!heartbeatFetch.ok) {
    manifest.required.Heartbeat = {
      ok: false,
      statusCode: heartbeatFetch.statusCode ?? null,
      error: heartbeatFetch.error,
      bytes: null,
      points: null,
      invalidLines: null,
    };
    await safeWriteManifest(dir, manifest);
    throw new Error(
      heartbeatFetch.statusCode
        ? `Failed to download Heartbeat: ${heartbeatFetch.statusCode}`
        : `Failed to download Heartbeat: ${heartbeatFetch.error}`,
    );
  }
  manifest.required.Heartbeat = {
    ok: true,
    statusCode: heartbeatFetch.statusCode,
    error: null,
    bytes: heartbeatFetch.bytes,
    points: null,
    invalidLines: null,
  };

  const sessionInfo = parseFirstLine(sessionInfoFetch.raw);
  const heartbeat = parseFirstLine(heartbeatFetch.raw);
  const startUtc = extractStartUtc(heartbeat);
  manifest.startUtc = startUtc.toISOString();
  manifest.heartbeat = {
    utc: String(
      heartbeat.json.Utc ?? heartbeat.json.UtcTime ?? heartbeat.json.utc ?? '',
    ),
    offsetMs: heartbeat.offsetMs,
  };

  const topics = feeds.map((f) => f.name).sort((a, b) => a.localeCompare(b));
  manifest.topicsAttempted = topics;

  const all = (await Promise.all(
    topics.map(async (topic) => {
      const def = feedByName.get(topic);
      const streamPath = def?.streamPath ?? `${topic}.jsonStream`;
      const url = `${prefix}${streamPath}`;
      const result =
        topic === 'SessionInfo'
          ? sessionInfoFetch
          : topic === 'Heartbeat'
            ? heartbeatFetch
            : await fetchUrlWithMeta(url);
      if (!result.ok) {
        manifest.topics[topic] = {
          ok: false,
          statusCode: result.statusCode ?? null,
          error: result.error,
          bytes: null,
          points: null,
          invalidLines: null,
        };
        return [];
      }
      let invalidLines = 0;
      const points = parseJsonStreamLines(topic, result.raw, startUtc, {
        onInvalidLine: () => {
          invalidLines += 1;
        },
      });
      manifest.topics[topic] = {
        ok: true,
        statusCode: result.statusCode,
        error: null,
        bytes: result.bytes,
        points: points.length,
        invalidLines,
      };
      return points;
    }),
  )).flat();

  // Download keyframes to a separate file (useful for schema inspection and when streams are missing).
  const keyframes: Record<string, unknown> = {};
  await Promise.all(
    topics.map(async (topic) => {
      const def = feedByName.get(topic);
      const keyFramePath = def?.keyFramePath ?? `${topic}.json`;
      const url = `${prefix}${keyFramePath}`;
      const result = await fetchUrlWithMeta(url);
      if (!result.ok) {
        manifest.keyframes[topic] = {
          ok: false,
          statusCode: result.statusCode ?? null,
          error: result.error,
          bytes: null,
          points: null,
          invalidLines: null,
        };
        return;
      }
      manifest.keyframes[topic] = {
        ok: true,
        statusCode: result.statusCode,
        error: null,
        bytes: result.bytes,
        points: null,
        invalidLines: null,
      };
      try {
        keyframes[topic] = parseJsonText(result.raw);
      } catch {
        // Best effort; store raw text if JSON parsing fails.
        keyframes[topic] = stripBom(result.raw);
      }
    }),
  );

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
  await fs.writeFile(
    path.join(dir, 'keyframes.json'),
    JSON.stringify(keyframes, null, 2),
    'utf-8',
  );
  await fs.writeFile(
    path.join(dir, 'download.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8',
  );

  return { dir, lineCount: lines.length };
}

async function fetchUrlWithMeta(
  url: string,
): Promise<
  | { ok: true; raw: string; statusCode: number; bytes: number }
  | { ok: false; error: string; statusCode?: number }
> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, statusCode: res.status };
    }
    const raw = await res.text();
    return {
      ok: true,
      raw,
      statusCode: res.status,
      bytes: Buffer.byteLength(raw, 'utf-8'),
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        error: `Timed out downloading ${url} after ${FETCH_TIMEOUT_MS}ms`,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseFirstLine(raw: string): { json: any; offsetMs: number } {
  const line = raw.split('\n').find((x) => x.trim().length > 0);
  if (!line) throw new Error('Stream missing data');
  const cleaned = stripBom(line);
  const offsetMs = parseOffsetMs(cleaned.slice(0, 12));
  const json = JSON.parse(cleaned.slice(12));
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

function stripBom(value: string) {
  return value.replace(/^\uFEFF/, '');
}

function parseJsonText(raw: string): unknown {
  return JSON.parse(stripBom(raw));
}

function isSessionIndexPayload(value: unknown): value is SessionIndexPayload {
  if (!value || typeof value !== 'object') return false;
  const feeds = (value as any).Feeds;
  return (
    'Feeds' in (value as any)
    && typeof feeds === 'object'
    && feeds !== null
    && !Array.isArray(feeds)
  );
}

function extractFeeds(payload: SessionIndexPayload): FeedDef[] {
  const feedsRaw = payload.Feeds ?? {};
  if (!feedsRaw || typeof feedsRaw !== 'object') return [];
  const out: FeedDef[] = [];
  for (const [name, raw] of Object.entries(feedsRaw)) {
    const keyFramePath = typeof raw?.KeyFramePath === 'string' ? raw.KeyFramePath : null;
    const streamPath = typeof raw?.StreamPath === 'string' ? raw.StreamPath : null;
    out.push({ name, keyFramePath, streamPath });
  }
  return out;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

async function safeWriteManifest(dir: string, manifest: unknown) {
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'download.json'),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
  } catch {
    // Best effort only.
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
