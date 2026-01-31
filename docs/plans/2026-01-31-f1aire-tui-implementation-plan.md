# F1aire TUI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript Ink TUI that downloads F1 live timing data for a selected season/meeting/session, stores it in an XDG data directory, and shows a light race summary.

**Architecture:** Keep a UI-agnostic `core/` layer for data access, download, parsing, and summaries, and a `tui/` layer for Ink screens and navigation. Route screens in `src/app.tsx` and render via `src/index.ts`.

**Tech Stack:** Node 24.13.0 (mise), TypeScript (ESM, `nodenext`), Ink + ink-select-input, Vitest, ESLint flat config, Prettier.

---

### Task 1: Scaffold tooling + first failing test (xdg paths)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`
- Create: `eslint.config.js`
- Create: `prettier.config.mjs`
- Create: `mise.toml`
- Create: `src/core/xdg.ts`
- Create: `src/core/xdg.test.ts`
- Create: `src/index.ts` (minimal placeholder for build)

**Step 1: Write the failing test**

`src/core/xdg.test.ts`
```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { getDataDir } from './xdg.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('getDataDir', () => {
  it('uses XDG_DATA_HOME when set', () => {
    process.env.XDG_DATA_HOME = '/tmp/xdg-data';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/tmp/xdg-data/f1aire/data');
  });

  it('falls back to ~/.local/share on unix', () => {
    delete process.env.XDG_DATA_HOME;
    process.env.HOME = '/home/tester';
    const dir = getDataDir('f1aire');
    expect(dir).toBe('/home/tester/.local/share/f1aire/data');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test`
Expected: FAIL (missing vitest config / missing getDataDir export).

**Step 3: Write minimal implementation + tooling config**

`package.json`
```json
{
  "name": "f1aire",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "f1aire": "dist/index.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest run"
  },
  "dependencies": {
    "ink": "^5.0.0",
    "ink-select-input": "^6.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^24.0.0",
    "@types/react": "^18.3.0",
    "eslint": "^9.0.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.3.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`tsconfig.build.json`
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "sourceMap": false
  }
}
```

`eslint.config.js`
```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier
];
```

`prettier.config.mjs`
```js
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all'
};
```

`mise.toml`
```toml
[tools]
node = "24.13.0"

[tasks.dev]
run = "npm run dev"

[tasks.build]
run = "npm run build"

[tasks.typecheck]
run = "npm run typecheck"

[tasks.lint]
run = "npm run lint"

[tasks.format]
run = "npm run format"

[tasks.test]
run = "npm run test"
```

`src/core/xdg.ts`
```ts
import path from 'node:path';

export function getDataDir(appName: string): string {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? '';
    return path.join(local, appName, 'data');
  }

  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, appName, 'data');
  }

  const home = process.env.HOME ?? '';
  return path.join(home, '.local', 'share', appName, 'data');
}
```

`src/index.ts`
```ts
// placeholder entry so build works before TUI is implemented
console.log('f1aire: scaffold');
```

**Step 4: Run test to verify it passes**

Run: `mise run test`
Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.build.json eslint.config.js prettier.config.mjs mise.toml src/core/xdg.ts src/core/xdg.test.ts src/index.ts
git commit -m "feat: scaffold tooling and xdg paths"
```

---

### Task 2: Fetch season meetings from F1 live timing index

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/f1-api.ts`
- Create: `src/core/f1-api.test.ts`

**Step 1: Write the failing test**

`src/core/f1-api.test.ts`
```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { getMeetings } from './f1-api.js';
import type { MeetingsIndex } from './types.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMeetings', () => {
  it('requests the correct index url and returns parsed JSON', async () => {
    const payload: MeetingsIndex = { Year: 2024, Meetings: [] };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMeetings(2024);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://livetiming.formula1.com/static/2024/Index.json',
      expect.any(Object),
    );
    expect(result.Year).toBe(2024);
  });

  it('throws on non-OK responses', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMeetings(2024)).rejects.toThrow(/Failed to fetch/);
  });

  it('throws when payload shape is invalid', async () => {
    const payload = { Year: '2024', Meetings: {} };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMeetings(2024)).rejects.toThrow(/Invalid meetings index/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/core/f1-api.test.ts`
Expected: FAIL (missing module or function).

**Step 3: Write minimal implementation**

`src/core/types.ts`
```ts
export type MeetingsIndex = {
  Year: number;
  Meetings: Meeting[];
};

export type Meeting = {
  Key: number;
  Name: string;
  Location: string;
  Sessions: Session[];
};

export type Session = {
  Key: number;
  Name: string;
  Type: string;
  StartDate: string;
  EndDate: string;
  GmtOffset: string;
  Path?: string | null;
};
```

`src/core/f1-api.ts`
```ts
import type { MeetingsIndex } from './types.js';

const USER_AGENT = `f1aire/0.1.0`;
const FETCH_TIMEOUT_MS = 10000;

export async function getMeetings(year: number): Promise<MeetingsIndex> {
  const url = `https://livetiming.formula1.com/static/${year}/Index.json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch meetings for ${year}: ${res.status}`);
    }
    const data = (await res.json()) as MeetingsIndex;
    if (!isMeetingsIndex(data)) {
      throw new Error('Invalid meetings index response');
    }
    return data;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Timed out fetching meetings for ${year}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isMeetingsIndex(value: MeetingsIndex): boolean {
  return (
    typeof value?.Year === 'number' &&
    Array.isArray(value?.Meetings)
  );
}
```

Add `engines.node` in `package.json` to enforce Node >= 24.13.0 for global fetch.

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/core/f1-api.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/types.ts src/core/f1-api.ts src/core/f1-api.test.ts
git commit -m "feat: fetch meetings index"
```

---

### Task 3: Parse jsonStream lines into RawTimingDataPoint

**Files:**
- Create: `src/core/parse.ts`
- Create: `src/core/parse.test.ts`

**Step 1: Write the failing test**

`src/core/parse.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest';
import { parseJsonStreamLines } from './parse.js';

const sample = [
  '00:00:01.000{"foo":1}',
  '00:00:02.500{"bar":2}',
].join('\n');

describe('parseJsonStreamLines', () => {
  it('parses offsets and json payloads', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const points = parseJsonStreamLines('TimingData', sample, start);
    expect(points).toHaveLength(2);
    expect(points[0].type).toBe('TimingData');
    expect(points[0].dateTime.toISOString()).toBe('2024-01-01T00:00:01.000Z');
    expect(points[1].json.bar).toBe(2);
  });

  it('handles CRLF input', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const crlf = '00:00:01.000{\"foo\":1}\\r\\n00:00:02.000{\"bar\":2}';
    const points = parseJsonStreamLines('TimingData', crlf, start);
    expect(points).toHaveLength(2);
  });

  it('skips malformed lines', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const mixed = [
      '00:00:01.000{\"ok\":true}',
      'bad-offset{\"nope\":true}',
      '00:00:03.000{\"ok\":false}',
      '00:00:04.000{\"broken\":',
    ].join('\\n');
    const onInvalidLine = vi.fn();
    const points = parseJsonStreamLines('TimingData', mixed, start, { onInvalidLine });
    expect(points).toHaveLength(2);
    expect(onInvalidLine).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/core/parse.test.ts`
Expected: FAIL (missing parser).

**Step 3: Write minimal implementation**

`src/core/parse.ts`
```ts
export type RawTimingDataPoint = {
  type: string;
  json: Record<string, unknown>;
  dateTime: Date;
};

export function parseOffsetMs(offset: string): number {
  const [hh, mm, rest] = offset.split(':');
  const [ss, ms] = rest.split('.');
  return (
    Number(hh) * 3600000 +
    Number(mm) * 60000 +
    Number(ss) * 1000 +
    Number(ms)
  );
}

export function parseJsonStreamLines(
  type: string,
  raw: string,
  start: Date,
  options?: { onInvalidLine?: (line: string) => void },
): RawTimingDataPoint[] {
  const offsetPattern = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
  return raw
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      if (!offsetPattern.test(line)) {
        options?.onInvalidLine?.(line);
        return [];
      }
      const offset = line.slice(0, 12); // HH:MM:SS.mmm
      const payload = line.slice(12);
      try {
        const offsetMs = parseOffsetMs(offset);
        return [
          {
            type,
            json: JSON.parse(payload),
            dateTime: new Date(start.getTime() + offsetMs),
          },
        ];
      } catch {
        options?.onInvalidLine?.(line);
        return [];
      }
    });
}
```

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/core/parse.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/parse.ts src/core/parse.test.ts
git commit -m "feat: parse jsonStream lines"
```

---

### Task 4: Download session data and write live.jsonl + subscribe.json

**Files:**
- Create: `src/core/download.ts`
- Create: `src/core/download.test.ts`
- Modify: `src/core/parse.ts` (export helpers if needed)
- Modify: `src/core/types.ts` (optional shared types)

**Step 1: Write the failing test**

`src/core/download.test.ts`
```ts
import { describe, expect, it, vi } from 'vitest';
import { downloadSession } from './download.js';
import { mkdtempSync, readFileSync } from 'node:fs';
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
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/core/download.test.ts`
Expected: FAIL (missing downloadSession).

**Step 3: Write minimal implementation**

`src/core/download.ts`
```ts
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
```

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/core/download.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/download.ts src/core/download.test.ts src/core/parse.ts src/core/types.ts
git commit -m "feat: download and persist session data"
```

---

### Task 5: Summarize a session from live.jsonl

**Files:**
- Create: `src/core/summary.ts`
- Create: `src/core/summary.test.ts`

**Step 1: Write the failing test**

`src/core/summary.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { summarizeFromLines } from './summary.js';

const lines = [
  JSON.stringify({ type: 'DriverList', json: { '1': { FullName: 'Max TEST' } }, dateTime: '2024-01-01T00:00:00.000Z' }),
  JSON.stringify({ type: 'TimingData', json: { Lines: { '1': { Position: '1', BestLapTime: { Value: '1:30.000', Lap: 12 }, NumberOfLaps: 57 } } }, dateTime: '2024-01-01T00:01:00.000Z' }),
  JSON.stringify({ type: 'LapCount', json: { TotalLaps: 57 }, dateTime: '2024-01-01T00:01:01.000Z' }),
].join('\n');

describe('summarizeFromLines', () => {
  it('derives winner, fastest lap, total laps', () => {
    const summary = summarizeFromLines(lines);
    expect(summary.winner?.name).toBe('Max TEST');
    expect(summary.fastestLap?.time).toBe('1:30.000');
    expect(summary.totalLaps).toBe(57);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/core/summary.test.ts`
Expected: FAIL (missing summarizeFromLines).

**Step 3: Write minimal implementation**

`src/core/summary.ts`
```ts
export type Summary = {
  winner: { number: string; name: string } | null;
  fastestLap: { number: string; name: string; time: string } | null;
  totalLaps: number | null;
};

export function summarizeFromLines(raw: string): Summary {
  const driverNames = new Map<string, string>();
  let latestTiming: Record<string, any> = {};
  let totalLaps: number | null = null;
  let bestLap: { num: string; timeMs: number; time: string } | null = null;

  for (const line of raw.split('\n').filter((l) => l.trim().length > 0)) {
    const entry = JSON.parse(line);
    if (entry.type === 'DriverList') {
      for (const [num, data] of Object.entries(entry.json)) {
        const name = (data as any).FullName ?? (data as any).BroadcastName;
        if (name) driverNames.set(num, name);
      }
    }
    if (entry.type === 'TimingData') {
      latestTiming = entry.json.Lines ?? latestTiming;
      for (const [num, driver] of Object.entries(latestTiming)) {
        const time = (driver as any).BestLapTime?.Value as string | undefined;
        if (!time) continue;
        const ms = parseLapTimeMs(time);
        if (ms !== null && (!bestLap || ms < bestLap.timeMs)) {
          bestLap = { num, timeMs: ms, time };
        }
      }
    }
    if (entry.type === 'LapCount') {
      totalLaps = (entry.json.TotalLaps as number) ?? totalLaps;
    }
  }

  const winnerNum = Object.entries(latestTiming)
    .sort((a, b) => Number(a[1].Position ?? 999) - Number(b[1].Position ?? 999))
    .map(([num]) => num)[0];

  return {
    winner: winnerNum
      ? { number: winnerNum, name: driverNames.get(winnerNum) ?? winnerNum }
      : null,
    fastestLap: bestLap
      ? {
          number: bestLap.num,
          name: driverNames.get(bestLap.num) ?? bestLap.num,
          time: bestLap.time,
        }
      : null,
    totalLaps,
  };
}

export function parseLapTimeMs(value: string): number | null {
  const parts = value.split(':');
  if (parts.length === 1) {
    const [sec, ms] = parts[0].split('.');
    if (!sec || !ms) return null;
    return Number(sec) * 1000 + Number(ms);
  }
  if (parts.length === 2) {
    const [min, rest] = parts;
    const [sec, ms] = rest.split('.');
    if (!min || !sec || !ms) return null;
    return Number(min) * 60000 + Number(sec) * 1000 + Number(ms);
  }
  return null;
}
```

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/core/summary.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/core/summary.ts src/core/summary.test.ts
git commit -m "feat: summarize session results"
```

---

### Task 6: Build Ink screens + router

**Files:**
- Create: `src/app.tsx`
- Create: `src/tui/screens/SeasonPicker.tsx`
- Create: `src/tui/screens/MeetingPicker.tsx`
- Create: `src/tui/screens/SessionPicker.tsx`
- Create: `src/tui/screens/Downloading.tsx`
- Create: `src/tui/screens/Summary.tsx`
- Create: `src/tui/components/Header.tsx`
- Create: `src/tui/components/FooterHints.tsx`
- Create: `src/tui/components/SelectList.tsx`
- Create: `src/tui/ui-utils.ts`
- Create: `src/tui/ui-utils.test.ts`
- Modify: `src/index.ts`

**Step 1: Write the failing test**

`src/tui/ui-utils.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { formatBreadcrumb } from './ui-utils.js';

describe('formatBreadcrumb', () => {
  it('renders breadcrumb parts with arrows', () => {
    expect(formatBreadcrumb(['2024', 'Silverstone', 'Race'])).toBe(
      '2024 → Silverstone → Race',
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/tui/ui-utils.test.ts`
Expected: FAIL (missing formatBreadcrumb).

**Step 3: Write minimal implementation**

`src/tui/ui-utils.ts`
```ts
export function formatBreadcrumb(parts: string[]): string {
  return parts.join(' → ');
}
```

`src/index.ts`
```ts
import React from 'react';
import { render } from 'ink';
import { App } from './app.js';

render(<App />);
```

`src/app.tsx`
```tsx
import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { getMeetings } from './core/f1-api.js';
import type { Meeting, Session } from './core/types.js';
import { getDataDir } from './core/xdg.js';
import { downloadSession } from './core/download.js';
import { summarizeFromLines } from './core/summary.js';
import fs from 'node:fs';
import path from 'node:path';
import { Header } from './tui/components/Header.js';
import { FooterHints } from './tui/components/FooterHints.js';
import { SeasonPicker } from './tui/screens/SeasonPicker.js';
import { MeetingPicker } from './tui/screens/MeetingPicker.js';
import { SessionPicker } from './tui/screens/SessionPicker.js';
import { Downloading } from './tui/screens/Downloading.js';
import { Summary } from './tui/screens/Summary.js';

type Screen =
  | { name: 'season' }
  | { name: 'meeting'; year: number; meetings: Meeting[] }
  | { name: 'session'; year: number; meetings: Meeting[]; meeting: Meeting }
  | { name: 'downloading'; year: number; meeting: Meeting; session: Session }
  | { name: 'summary'; summary: ReturnType<typeof summarizeFromLines>; dir: string };

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'season' });
  const breadcrumb = useMemo(() => {
    if (screen.name === 'season') return ['Season'];
    if (screen.name === 'meeting') return [`${screen.year}`, 'Meeting'];
    if (screen.name === 'session') return [`${screen.year}`, screen.meeting.Name, 'Session'];
    if (screen.name === 'downloading')
      return [`${screen.year}`, screen.meeting.Name, screen.session.Name, 'Download'];
    if (screen.name === 'summary') return ['Summary'];
    return ['F1aire'];
  }, [screen]);

  useInput((input, key) => {
    if (input === 'q') process.exit(0);
    if (input === 'b' || key.backspace || key.escape) {
      if (screen.name === 'meeting') setScreen({ name: 'season' });
      if (screen.name === 'session')
        setScreen({ name: 'meeting', year: screen.year, meetings: screen.meetings });
      if (screen.name === 'summary') setScreen({ name: 'season' });
    }
  });

  return (
    <Box flexDirection="column">
      <Header breadcrumb={breadcrumb} />
      <Box flexGrow={1} flexDirection="column" marginLeft={1}>
        {screen.name === 'season' && (
          <SeasonPicker
            onSelect={async (year) => {
              const data = await getMeetings(year);
              setScreen({ name: 'meeting', year, meetings: data.Meetings });
            }}
          />
        )}
        {screen.name === 'meeting' && (
          <MeetingPicker
            year={screen.year}
            meetings={screen.meetings}
            onSelect={(meeting) =>
              setScreen({
                name: 'session',
                year: screen.year,
                meetings: screen.meetings,
                meeting,
              })
            }
          />
        )}
        {screen.name === 'session' && (
          <SessionPicker
            meeting={screen.meeting}
            onSelect={(session) =>
              setScreen({ name: 'downloading', year: screen.year, meeting: screen.meeting, session })
            }
          />
        )}
        {screen.name === 'downloading' && (
          <Downloading
            meeting={screen.meeting}
            session={screen.session}
            onComplete={(dir) => {
              const livePath = path.join(dir, 'live.jsonl');
              const lines = fs.readFileSync(livePath, 'utf-8');
              const summary = summarizeFromLines(lines);
              setScreen({ name: 'summary', summary, dir });
            }}
            onStart={async () => {
              const root = getDataDir('f1aire');
              const result = await downloadSession({
                year: screen.year,
                meeting: screen.meeting,
                sessionKey: screen.session.Key,
                dataRoot: root,
              });
              return result.dir;
            }}
          />
        )}
        {screen.name === 'summary' && (
          <Summary summary={screen.summary} dir={screen.dir} />
        )}
      </Box>
      <FooterHints />
    </Box>
  );
}
```

`src/tui/components/Header.tsx`
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { formatBreadcrumb } from '../ui-utils.js';

export function Header({ breadcrumb }: { breadcrumb: string[] }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="green">F1aire — Virtual Race Engineer</Text>
      <Text color="gray">{formatBreadcrumb(breadcrumb)}</Text>
    </Box>
  );
}
```

`src/tui/components/FooterHints.tsx`
```tsx
import React from 'react';
import { Text } from 'ink';

export function FooterHints() {
  return (
    <Text color="gray">Enter: select • b/backspace: back • q: quit</Text>
  );
}
```

`src/tui/components/SelectList.tsx`
```tsx
import React from 'react';
import SelectInput from 'ink-select-input';

export type SelectItem<T> = { label: string; value: T };

export function SelectList<T>({ items, onSelect }: { items: SelectItem<T>[]; onSelect: (item: T) => void }) {
  return (
    <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
  );
}
```

`src/tui/screens/SeasonPicker.tsx`
```tsx
import React from 'react';
import { Text } from 'ink';
import { SelectList } from '../components/SelectList.js';

export function SeasonPicker({ onSelect }: { onSelect: (year: number) => void }) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
  return (
    <>
      <Text>Select a season</Text>
      <SelectList items={years.map((y) => ({ label: String(y), value: y }))} onSelect={onSelect} />
    </>
  );
}
```

`src/tui/screens/MeetingPicker.tsx`
```tsx
import React from 'react';
import { Text } from 'ink';
import type { Meeting } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';

export function MeetingPicker({
  year,
  meetings,
  onSelect,
}: {
  year: number;
  meetings: Meeting[];
  onSelect: (meeting: Meeting) => void;
}) {
  return (
    <>
      <Text>Select a meeting for {year}</Text>
      <SelectList
        items={meetings.map((m) => ({ label: `${m.Name} (${m.Location})`, value: m }))}
        onSelect={onSelect}
      />
    </>
  );
}
```

`src/tui/screens/SessionPicker.tsx`
```tsx
import React from 'react';
import { Text } from 'ink';
import type { Meeting, Session } from '../../core/types.js';
import { SelectList } from '../components/SelectList.js';

export function SessionPicker({
  meeting,
  onSelect,
}: {
  meeting: Meeting;
  onSelect: (session: Session) => void;
}) {
  return (
    <>
      <Text>Select a session for {meeting.Name}</Text>
      <SelectList
        items={meeting.Sessions.map((s) => ({ label: `${s.Name} (${s.Type})`, value: s }))}
        onSelect={onSelect}
      />
    </>
  );
}
```

`src/tui/screens/Downloading.tsx`
```tsx
import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import type { Meeting, Session } from '../../core/types.js';

export function Downloading({
  meeting,
  session,
  onStart,
  onComplete,
}: {
  meeting: Meeting;
  session: Session;
  onStart: () => Promise<string>;
  onComplete: (dir: string) => void;
}) {
  const [status, setStatus] = useState('Starting download...');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const dir = await onStart();
        if (!mounted) return;
        setStatus('Download complete');
        onComplete(dir);
      } catch (err) {
        if (!mounted) return;
        setStatus(`Download failed: ${(err as Error).message}`);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [meeting, session, onStart, onComplete]);

  return <Text>{status}</Text>;
}
```

`src/tui/screens/Summary.tsx`
```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { Summary } from '../../core/summary.js';

export function Summary({ summary, dir }: { summary: Summary; dir: string }) {
  return (
    <Box flexDirection="column">
      <Text color="green">Download complete</Text>
      <Text>Data: {dir}</Text>
      <Text>
        Winner: {summary.winner ? summary.winner.name : 'Unknown'}
      </Text>
      <Text>
        Fastest lap: {summary.fastestLap ? `${summary.fastestLap.name} (${summary.fastestLap.time})` : 'Unknown'}
      </Text>
      <Text>Total laps: {summary.totalLaps ?? 'Unknown'}</Text>
    </Box>
  );
}
```

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/tui/ui-utils.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts src/app.tsx src/tui
 git commit -m "feat: ink screens and navigation"
```

---

### Task 7: Season helper + README + smoke run

**Files:**
- Create: `src/tui/season-utils.ts`
- Create: `src/tui/season-utils.test.ts`
- Modify: `src/tui/screens/SeasonPicker.tsx`
- Create: `README.md`

**Step 1: Write the failing test**

`src/tui/season-utils.test.ts`
```ts
import { describe, expect, it } from 'vitest';
import { getSeasonOptions } from './season-utils.js';

describe('getSeasonOptions', () => {
  it('returns 10 descending seasons', () => {
    const seasons = getSeasonOptions(2026);
    expect(seasons).toHaveLength(10);
    expect(seasons[0]).toBe(2026);
    expect(seasons[9]).toBe(2017);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `mise run test -- src/tui/season-utils.test.ts`
Expected: FAIL (missing getSeasonOptions).

**Step 3: Write minimal implementation**

`src/tui/season-utils.ts`
```ts
export function getSeasonOptions(currentYear: number): number[] {
  return Array.from({ length: 10 }, (_, i) => currentYear - i);
}
```

Modify `src/tui/screens/SeasonPicker.tsx` to use `getSeasonOptions`.

Create `README.md` with setup, data directory, and usage notes.

**Step 4: Run test to verify it passes**

Run: `mise run test -- src/tui/season-utils.test.ts`
Expected: PASS.

Then run: `mise run dev`
Expected: App launches and shows season picker.

**Step 5: Commit**

```bash
git add src/tui/season-utils.ts src/tui/season-utils.test.ts src/tui/screens/SeasonPicker.tsx README.md
git commit -m "feat: add season helper and docs"
```

---

## Plan Complete

Plan saved to `docs/plans/2026-01-31-f1aire-tui-implementation-plan.md`.

Two execution options:

1. **Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks.
2. **Parallel Session** — Open a new session and run tasks with `superpowers:executing-plans`.

Which approach?
