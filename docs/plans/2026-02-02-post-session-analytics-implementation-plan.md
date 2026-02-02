# Post-Session Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add deterministic post-session analysis (pace/deg, strategy windows, head-to-head, position changes) with a time-cursor and tool-first chat answers.

**Architecture:** Build an `AnalysisIndex` from `SessionStore` + processors, add a shared `TimeCursor` resolver, and expose new tools that read from the index. Update the TUI to show the current “as-of” cursor.

**Tech Stack:** Node.js, TypeScript, Vitest, Ink TUI, ai-sdk tools.

---

### Task 1: Traffic classification helper

**Files:**
- Create: `src/core/traffic.ts`
- Test: `src/core/traffic.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { classifyTraffic } from './traffic.js';

describe('classifyTraffic', () => {
  it('labels traffic using lap-time scaled thresholds', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 0.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: true,
      }),
    ).toBe('traffic');
  });

  it('labels clean air on green laps with large gaps', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 2.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: true,
      }),
    ).toBe('clean');
  });

  it('never labels clean air on non-green laps', () => {
    const lapTimeMs = 90_000;
    expect(
      classifyTraffic({
        gapAheadSec: 2.5,
        gapBehindSec: 2.0,
        lapTimeMs,
        isGreen: false,
      }),
    ).toBe('neutral');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/traffic.test.ts`
Expected: FAIL with “Cannot find module './traffic.js'”

**Step 3: Write minimal implementation**

```ts
export type TrafficLabel = 'traffic' | 'clean' | 'neutral' | 'unknown';

export type TrafficThresholds = {
  trafficAheadBase: number;
  trafficAheadFactor: number;
  trafficBehindBase: number;
  trafficBehindFactor: number;
  cleanAheadBase: number;
  cleanAheadFactor: number;
  cleanBehindBase: number;
  cleanBehindFactor: number;
};

export const DEFAULT_TRAFFIC_THRESHOLDS: TrafficThresholds = {
  trafficAheadBase: 1.0,
  trafficAheadFactor: 0.012,
  trafficBehindBase: 0.8,
  trafficBehindFactor: 0.010,
  cleanAheadBase: 1.7,
  cleanAheadFactor: 0.018,
  cleanBehindBase: 1.3,
  cleanBehindFactor: 0.014,
};

export function classifyTraffic({
  gapAheadSec,
  gapBehindSec,
  lapTimeMs,
  isGreen,
  thresholds = DEFAULT_TRAFFIC_THRESHOLDS,
}: {
  gapAheadSec: number | null;
  gapBehindSec: number | null;
  lapTimeMs: number | null;
  isGreen: boolean | null;
  thresholds?: TrafficThresholds;
}): TrafficLabel {
  if (!Number.isFinite(lapTimeMs ?? NaN)) return 'unknown';
  if (!Number.isFinite(gapAheadSec ?? NaN) || !Number.isFinite(gapBehindSec ?? NaN)) {
    return 'unknown';
  }
  const lapTimeSec = (lapTimeMs ?? 0) / 1000;
  const trafficAhead = Math.max(
    thresholds.trafficAheadBase,
    thresholds.trafficAheadFactor * lapTimeSec,
  );
  const trafficBehind = Math.max(
    thresholds.trafficBehindBase,
    thresholds.trafficBehindFactor * lapTimeSec,
  );
  const cleanAhead = Math.max(
    thresholds.cleanAheadBase,
    thresholds.cleanAheadFactor * lapTimeSec,
  );
  const cleanBehind = Math.max(
    thresholds.cleanBehindBase,
    thresholds.cleanBehindFactor * lapTimeSec,
  );

  if (gapAheadSec <= trafficAhead || gapBehindSec <= trafficBehind) return 'traffic';
  if (isGreen && gapAheadSec >= cleanAhead && gapBehindSec >= cleanBehind) return 'clean';
  return 'neutral';
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/traffic.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/traffic.ts src/core/traffic.test.ts
git commit -m "feat: add traffic classification helper"
```

---

### Task 2: TimeCursor resolver

**Files:**
- Create: `src/core/time-cursor.ts`
- Test: `src/core/time-cursor.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { resolveTimeCursor } from './time-cursor.js';

describe('resolveTimeCursor', () => {
  it('resolves latest when no cursor provided', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
    ]);
    const resolved = resolveTimeCursor({ lapTimes, lapNumbers: [1, 2] });
    expect(resolved.lap).toBe(2);
  });

  it('resolves nearest lap for out-of-range lap number', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
      [4, new Date('2024-01-01T00:03:10Z')],
    ]);
    const resolved = resolveTimeCursor({
      lapTimes,
      lapNumbers: [1, 2, 4],
      cursor: { lap: 3 },
    });
    expect(resolved.lap).toBe(2);
  });

  it('resolves nearest lap for iso timestamp', () => {
    const lapTimes = new Map([
      [1, new Date('2024-01-01T00:00:10Z')],
      [2, new Date('2024-01-01T00:01:10Z')],
      [3, new Date('2024-01-01T00:02:10Z')],
    ]);
    const resolved = resolveTimeCursor({
      lapTimes,
      lapNumbers: [1, 2, 3],
      cursor: { iso: '2024-01-01T00:01:40Z' },
    });
    expect(resolved.lap).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/time-cursor.test.ts`
Expected: FAIL with “Cannot find module './time-cursor.js'”

**Step 3: Write minimal implementation**

```ts
export type TimeCursor = { lap?: number; iso?: string; latest?: boolean };

export type ResolvedCursor = {
  lap: number | null;
  dateTime: Date | null;
  source: 'latest' | 'lap' | 'time' | 'none';
};

export function resolveTimeCursor({
  lapTimes,
  lapNumbers,
  cursor,
}: {
  lapTimes: Map<number, Date | null>;
  lapNumbers: number[];
  cursor?: TimeCursor | null;
}): ResolvedCursor {
  const sorted = [...lapNumbers].sort((a, b) => a - b);
  if (!sorted.length) return { lap: null, dateTime: null, source: 'none' };

  const pickLap = (lap: number) => {
    const nearest = sorted.reduce((best, current) => {
      const bestDiff = Math.abs(best - lap);
      const currentDiff = Math.abs(current - lap);
      if (currentDiff < bestDiff) return current;
      if (currentDiff === bestDiff) return Math.min(best, current);
      return best;
    }, sorted[0]);
    return nearest;
  };

  if (!cursor || cursor.latest) {
    const lap = sorted[sorted.length - 1];
    return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
  }

  if (typeof cursor.lap === 'number') {
    const lap = pickLap(cursor.lap);
    return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'lap' };
  }

  if (cursor.iso) {
    const target = new Date(cursor.iso);
    if (!Number.isFinite(target.getTime())) {
      const lap = sorted[sorted.length - 1];
      return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
    }
    let bestLap = sorted[0];
    let bestDiff = Infinity;
    for (const lap of sorted) {
      const dt = lapTimes.get(lap);
      if (!dt) continue;
      const diff = Math.abs(dt.getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestLap = lap;
      }
    }
    return { lap: bestLap, dateTime: lapTimes.get(bestLap) ?? null, source: 'time' };
  }

  const lap = sorted[sorted.length - 1];
  return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/time-cursor.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/time-cursor.ts src/core/time-cursor.test.ts
git commit -m "feat: add time cursor resolver"
```

---

### Task 3: AnalysisIndex base builder (lap records + time cursor)

**Files:**
- Create: `src/core/analysis-index.ts`
- Test: `src/core/analysis-index.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { TimingService } from './timing-service.js';
import { buildAnalysisIndex } from './analysis-index.js';
import type { SessionStore } from './session-store.js';

const makeStore = (live: any[]): SessionStore => {
  const byType = new Map<string, any[]>();
  for (const point of live) {
    const arr = byType.get(point.type) ?? [];
    arr.push(point);
    byType.set(point.type, arr);
  }
  return {
    raw: { subscribe: {}, live },
    topic: (name: string) => ({
      latest: (byType.get(name) ?? []).slice(-1)[0] ?? null,
      timeline: () => byType.get(name) ?? [],
    }),
  } as SessionStore;
};

describe('buildAnalysisIndex', () => {
  it('builds lap records and resolves as-of laps', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': {
              NumberOfLaps: 1,
              Position: '1',
              LapTime: { Value: '1:30.000' },
              GapToLeader: '0',
            },
            '2': {
              NumberOfLaps: 1,
              Position: '2',
              LapTime: { Value: '1:31.000' },
              GapToLeader: '+1.2',
              IntervalToPositionAhead: { Value: '+1.2' },
            },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': {
              NumberOfLaps: 2,
              Position: '1',
              LapTime: { Value: '1:30.500' },
              GapToLeader: '0',
            },
            '2': {
              NumberOfLaps: 2,
              Position: '2',
              LapTime: { Value: '1:31.200' },
              GapToLeader: '+1.6',
              IntervalToPositionAhead: { Value: '+1.6' },
            },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const store = makeStore(live);
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ store, processors: timing.processors });

    expect(index.lapNumbers).toEqual([1, 2]);
    expect(index.byDriver.get('1')?.length).toBe(2);
    expect(index.byDriver.get('2')?.[0]?.lapTimeMs).toBe(91_000);

    const resolved = index.resolveAsOf({ lap: 2 });
    expect(resolved.lap).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: FAIL with “Cannot find module './analysis-index.js'”

**Step 3: Write minimal implementation**

```ts
import type { SessionStore } from './session-store.js';
import { extractLapTimeMs, parseGapSeconds, parseIntervalSeconds, trackStatusIsGreen, isPitLap, smartGapToLeaderSeconds } from './analysis-utils.js';
import { classifyTraffic, DEFAULT_TRAFFIC_THRESHOLDS, type TrafficLabel } from './traffic.js';
import { resolveTimeCursor, type TimeCursor, type ResolvedCursor } from './time-cursor.js';
import { isPlainObject } from './processors/merge.js';

export type LapRecord = {
  lap: number;
  driverNumber: string;
  dateTime: Date | null;
  lapTimeMs: number | null;
  gapToLeaderSec: number | null;
  intervalToAheadSec: number | null;
  position: number | null;
  traffic: TrafficLabel;
  trackStatus: { status: string | null; message: string | null; isGreen: boolean | null } | null;
  flags: { pit: boolean; pitIn: boolean; pitOut: boolean; inPit: boolean };
  stint: { compound: string | null; age: number | null; stint: number | null } | null;
};

export type AnalysisIndex = {
  lapNumbers: number[];
  drivers: string[];
  byDriver: Map<string, LapRecord[]>;
  byLap: Map<number, Map<string, LapRecord>>;
  resolveAsOf: (cursor?: TimeCursor | null) => ResolvedCursor;
};

const getStintForLap = (timingAppData: any, driverNumber: string, lap: number) => {
  const lines = timingAppData?.Lines ?? {};
  const line = lines?.[driverNumber];
  const stints = line?.Stints ?? null;
  if (!stints) return null;
  const items: any[] = Array.isArray(stints)
    ? stints
    : Object.keys(stints)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => stints[key]);
  for (const stint of items) {
    const start = Number(stint?.StartLaps ?? 0);
    const total = Number(stint?.TotalLaps ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(total)) continue;
    const startLap = start + 1;
    const endLap = start + total;
    if (lap >= startLap && lap <= endLap) return stint;
  }
  return items.length ? items[items.length - 1] : null;
};

export function buildAnalysisIndex({
  store,
  processors,
}: {
  store: SessionStore;
  processors: any;
}): AnalysisIndex {
  const timing = processors.timingData;
  const trackStatus = processors.trackStatus;
  const timingApp = processors.timingAppData?.state ?? null;
  const byDriver = new Map<string, LapRecord[]>();
  const byLap = new Map<number, Map<string, LapRecord>>();
  const lapNumbers = timing?.getLapNumbers?.() ?? [];
  const drivers = new Set<string>();
  const lapTimes = new Map<number, Date | null>();

  for (const lap of lapNumbers) {
    const lapDrivers = timing?.driversByLap?.get(lap) ?? new Map();
    const linesObj: Record<string, any> = {};
    for (const [num, snap] of lapDrivers.entries()) linesObj[num] = snap;
    for (const [driverNumber, snapshot] of lapDrivers.entries()) {
      drivers.add(driverNumber);
      const dt = (snapshot as any)?.__dateTime as Date | undefined;
      if (dt && !lapTimes.has(lap)) lapTimes.set(lap, dt);
      const track = dt ? trackStatus?.getAt?.(dt) : trackStatus?.state;
      const status = track ? String((track as any)?.Status ?? '') : null;
      const message = track ? String((track as any)?.Message ?? '') : null;
      const isGreen = track ? trackStatusIsGreen(status, message) : null;
      const lapTimeMs = extractLapTimeMs(snapshot, { preferPrevious: true });
      const gapToLeaderSec = smartGapToLeaderSeconds(linesObj, driverNumber);
      const intervalToAheadSec = parseIntervalSeconds(
        (snapshot as any)?.IntervalToPositionAhead?.Value,
      );

      const positionRaw = (snapshot as any)?.Position ?? (snapshot as any)?.Line;
      const position = Number.isFinite(Number(positionRaw)) ? Number(positionRaw) : null;

      const flags = {
        pit: Boolean((snapshot as any)?.IsPitLap),
        pitIn: Boolean((snapshot as any)?.PitIn),
        pitOut: Boolean((snapshot as any)?.PitOut),
        inPit: Boolean((snapshot as any)?.InPit),
      };

      const stint = getStintForLap(timingApp, driverNumber, lap);
      const stintInfo = stint
        ? {
            compound: stint?.Compound ? String(stint.Compound) : null,
            age: Number.isFinite(Number(stint?.TyreAge)) ? Number(stint.TyreAge) : null,
            stint: Number.isFinite(Number(stint?.Stint)) ? Number(stint.Stint) : null,
          }
        : null;

      const traffic = classifyTraffic({
        gapAheadSec: intervalToAheadSec,
        gapBehindSec: gapToLeaderSec === null ? null : gapToLeaderSec,
        lapTimeMs,
        isGreen,
        thresholds: DEFAULT_TRAFFIC_THRESHOLDS,
      });

      const record: LapRecord = {
        lap,
        driverNumber,
        dateTime: dt ?? null,
        lapTimeMs,
        gapToLeaderSec,
        intervalToAheadSec,
        position,
        traffic,
        trackStatus: track
          ? { status, message, isGreen }
          : null,
        flags,
        stint: stintInfo,
      };

      if (!byDriver.has(driverNumber)) byDriver.set(driverNumber, []);
      byDriver.get(driverNumber)?.push(record);
      if (!byLap.has(lap)) byLap.set(lap, new Map());
      byLap.get(lap)?.set(driverNumber, record);
    }
  }

  for (const list of byDriver.values()) list.sort((a, b) => a.lap - b.lap);

  return {
    lapNumbers: [...lapNumbers],
    drivers: Array.from(drivers.values()),
    byDriver,
    byLap,
    resolveAsOf: (cursor?: TimeCursor | null) =>
      resolveTimeCursor({ lapTimes, lapNumbers, cursor }),
  };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/analysis-index.ts src/core/analysis-index.test.ts
git commit -m "feat: add analysis index base builder"
```

---

### Task 4: AnalysisIndex events (pit events + position changes)

**Files:**
- Modify: `src/core/analysis-index.ts`
- Test: `src/core/analysis-index.test.ts`

**Step 1: Write the failing test**

Append to `src/core/analysis-index.test.ts`:

```ts
  it('derives pit events and position changes', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 1, Position: '1', LapTime: { Value: '1:30.000' } },
            '2': { NumberOfLaps: 1, Position: '2', LapTime: { Value: '1:31.000' } },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 2, Position: '2', LapTime: { Value: '1:32.000' }, PitIn: true },
            '2': { NumberOfLaps: 2, Position: '1', LapTime: { Value: '1:30.500' } },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const store = makeStore(live);
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ store, processors: timing.processors });

    expect(index.getPitEvents().length).toBe(1);
    expect(index.getPositionChanges().length).toBe(2);
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: FAIL with “index.getPitEvents is not a function”

**Step 3: Write minimal implementation**

Add to `src/core/analysis-index.ts`:

```ts
export type PitEvent = { driverNumber: string; lap: number; type: 'pit' | 'pit-in' | 'pit-out' };
export type PositionChange = { driverNumber: string; lap: number; from: number | null; to: number | null };

// inside AnalysisIndex type
getPitEvents: () => PitEvent[];
getPositionChanges: () => PositionChange[];

// inside buildAnalysisIndex, after byDriver/byLap built
const pitEvents: PitEvent[] = [];
const positionChanges: PositionChange[] = [];

for (const [driverNumber, records] of byDriver.entries()) {
  for (const record of records) {
    if (record.flags.pitIn) pitEvents.push({ driverNumber, lap: record.lap, type: 'pit-in' });
    else if (record.flags.pitOut) pitEvents.push({ driverNumber, lap: record.lap, type: 'pit-out' });
    else if (record.flags.pit) pitEvents.push({ driverNumber, lap: record.lap, type: 'pit' });
  }
}

const sortedLaps = [...lapNumbers].sort((a, b) => a - b);
for (let i = 1; i < sortedLaps.length; i += 1) {
  const prevLap = sortedLaps[i - 1];
  const lap = sortedLaps[i];
  const prevSnap = byLap.get(prevLap) ?? new Map();
  const currSnap = byLap.get(lap) ?? new Map();
  for (const [driverNumber, current] of currSnap.entries()) {
    const prev = prevSnap.get(driverNumber);
    if (!prev) continue;
    if (prev.position !== current.position) {
      positionChanges.push({
        driverNumber,
        lap,
        from: prev.position ?? null,
        to: current.position ?? null,
      });
    }
  }
}

// return object
getPitEvents: () => pitEvents,
getPositionChanges: () => positionChanges,
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/analysis-index.ts src/core/analysis-index.test.ts
git commit -m "feat: add pit events and position changes"
```

---

### Task 5: Pace + head-to-head metrics

**Files:**
- Modify: `src/core/analysis-index.ts`
- Test: `src/core/analysis-index.test.ts`

**Step 1: Write the failing test**

Append to `src/core/analysis-index.test.ts`:

```ts
  it('computes stint pace and driver comparisons', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 1, Position: '1', LapTime: { Value: '1:30.000' } },
            '2': { NumberOfLaps: 1, Position: '2', LapTime: { Value: '1:31.000' } },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 2, Position: '1', LapTime: { Value: '1:31.000' } },
            '2': { NumberOfLaps: 2, Position: '2', LapTime: { Value: '1:31.000' } },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const store = makeStore(live);
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ store, processors: timing.processors });

    const pace = index.getStintPace({ driverNumber: '1' });
    expect(pace.samples).toBe(2);

    const comparison = index.compareDrivers({ driverA: '1', driverB: '2' });
    expect(comparison.summary?.avgDeltaMs).toBeLessThan(0);
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: FAIL with “index.getStintPace is not a function”

**Step 3: Write minimal implementation**

Add to `src/core/analysis-index.ts`:

```ts
export type StintPaceResult = {
  driverNumber: string;
  samples: number;
  avgLapMs: number | null;
  slopeMsPerLap: number | null;
  laps: number[];
};

export type CompareDriversResult = {
  driverA: string;
  driverB: string;
  laps: Array<{ lap: number; deltaMs: number }>;
  summary: { avgDeltaMs: number | null } | null;
};

// in AnalysisIndex type
getStintPace: (opts: { driverNumber: string; startLap?: number; endLap?: number }) => StintPaceResult;
compareDrivers: (opts: { driverA: string; driverB: string; startLap?: number; endLap?: number }) => CompareDriversResult;

// inside buildAnalysisIndex
const getDriverLaps = (driverNumber: string, startLap?: number, endLap?: number) => {
  const records = byDriver.get(driverNumber) ?? [];
  return records.filter((r) => {
    if (typeof startLap === 'number' && r.lap < startLap) return false;
    if (typeof endLap === 'number' && r.lap > endLap) return false;
    return r.lapTimeMs !== null;
  });
};

const getStintPace = ({ driverNumber, startLap, endLap }: { driverNumber: string; startLap?: number; endLap?: number }): StintPaceResult => {
  const records = getDriverLaps(driverNumber, startLap, endLap);
  const times = records.map((r) => r.lapTimeMs ?? 0);
  if (!records.length) {
    return { driverNumber, samples: 0, avgLapMs: null, slopeMsPerLap: null, laps: [] };
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const slope = records.length > 1
    ? (times[times.length - 1] - times[0]) / (records.length - 1)
    : 0;
  return {
    driverNumber,
    samples: records.length,
    avgLapMs: avg,
    slopeMsPerLap: slope,
    laps: records.map((r) => r.lap),
  };
};

const compareDrivers = ({ driverA, driverB, startLap, endLap }: { driverA: string; driverB: string; startLap?: number; endLap?: number }): CompareDriversResult => {
  const a = getDriverLaps(driverA, startLap, endLap);
  const b = getDriverLaps(driverB, startLap, endLap);
  const laps = a
    .map((r) => ({ lap: r.lap, a: r.lapTimeMs }))
    .filter((r) => b.some((x) => x.lap === r.lap))
    .map((r) => {
      const bLap = b.find((x) => x.lap === r.lap);
      return { lap: r.lap, deltaMs: (r.a ?? 0) - (bLap?.lapTimeMs ?? 0) };
    });
  const avgDelta = laps.length
    ? laps.reduce((sum, row) => sum + row.deltaMs, 0) / laps.length
    : null;
  return {
    driverA,
    driverB,
    laps,
    summary: { avgDeltaMs: avgDelta },
  };
};

// in return object
getStintPace,
compareDrivers,
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/analysis-index.ts src/core/analysis-index.test.ts
git commit -m "feat: add pace and comparison metrics"
```

---

### Task 6: Strategy metrics (undercut window + simulate rejoin)

**Files:**
- Modify: `src/core/analysis-index.ts`
- Test: `src/core/analysis-index.test.ts`

**Step 1: Write the failing test**

Append to `src/core/analysis-index.test.ts`:

```ts
  it('computes undercut window and rejoin projection', () => {
    const live = [
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 1, Position: '1', LapTime: { Value: '1:30.000' }, GapToLeader: '0' },
            '2': { NumberOfLaps: 1, Position: '2', LapTime: { Value: '1:31.000' }, GapToLeader: '+1.0' },
          },
        },
        dateTime: new Date('2024-01-01T00:01:00Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '1': { NumberOfLaps: 2, Position: '1', LapTime: { Value: '1:30.000' }, GapToLeader: '0' },
            '2': { NumberOfLaps: 2, Position: '2', LapTime: { Value: '1:31.000' }, GapToLeader: '+1.2' },
          },
        },
        dateTime: new Date('2024-01-01T00:02:00Z'),
      },
    ];
    const store = makeStore(live);
    const timing = new TimingService();
    for (const point of live) timing.enqueue(point);

    const index = buildAnalysisIndex({ store, processors: timing.processors });

    const window = index.getUndercutWindow({ driverA: '1', driverB: '2', pitLossMs: 20_000 });
    expect(window.lapsToCover).toBeGreaterThan(0);

    const rejoin = index.simulateRejoin({ driver: '2', pitLossMs: 20_000, asOfLap: 2 });
    expect(rejoin.lossMs).toBe(20_000);
  });
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: FAIL with “index.getUndercutWindow is not a function”

**Step 3: Write minimal implementation**

Add to `src/core/analysis-index.ts`:

```ts
export type UndercutWindow = { avgDeltaMs: number | null; lapsToCover: number | null; pitLossMs: number | null };
export type RejoinProjection = { driverNumber: string; asOfLap: number; lossMs: number; projectedGapToLeaderSec: number | null };

// in AnalysisIndex type
getUndercutWindow: (opts: { driverA: string; driverB: string; pitLossMs: number | null }) => UndercutWindow;
simulateRejoin: (opts: { driver: string; pitLossMs: number; asOfLap: number }) => RejoinProjection;

// inside buildAnalysisIndex
const getUndercutWindow = ({ driverA, driverB, pitLossMs }: { driverA: string; driverB: string; pitLossMs: number | null }): UndercutWindow => {
  const comparison = compareDrivers({ driverA, driverB });
  const avgDelta = comparison.summary?.avgDeltaMs ?? null;
  if (!avgDelta || !pitLossMs) return { avgDeltaMs: avgDelta, lapsToCover: null, pitLossMs: pitLossMs ?? null };
  const lapsToCover = avgDelta < 0
    ? Math.ceil(pitLossMs / Math.abs(avgDelta))
    : Math.ceil(pitLossMs / Math.max(1, avgDelta));
  return { avgDeltaMs: avgDelta, lapsToCover, pitLossMs };
};

const simulateRejoin = ({ driver, pitLossMs, asOfLap }: { driver: string; pitLossMs: number; asOfLap: number }): RejoinProjection => {
  const snap = byLap.get(asOfLap)?.get(driver);
  const gapToLeader = snap?.gapToLeaderSec ?? null;
  const projectedGap = gapToLeader === null ? null : gapToLeader + pitLossMs / 1000;
  return {
    driverNumber: driver,
    asOfLap,
    lossMs: pitLossMs,
    projectedGapToLeaderSec: projectedGap,
  };
};

// in return object
getUndercutWindow,
simulateRejoin,
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/core/analysis-index.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/core/analysis-index.ts src/core/analysis-index.test.ts
git commit -m "feat: add strategy metrics"
```

---

### Task 7: Tools + prompt updates

**Files:**
- Modify: `src/agent/tools.ts`
- Modify: `src/agent/prompt.ts`
- Test: `src/agent/tools.test.ts`

**Step 1: Write the failing test**

Update `src/agent/tools.test.ts`:

```ts
import { buildAnalysisIndex } from '../core/analysis-index.js';

const tools = makeTools({
  store,
  processors,
  timeCursor: { latest: true },
  onTimeCursorChange: () => {},
});

expect(tools).toHaveProperty('get_stint_pace');
expect(tools).toHaveProperty('compare_drivers');
expect(tools).toHaveProperty('get_undercut_window');
expect(tools).toHaveProperty('simulate_rejoin');
expect(tools).toHaveProperty('get_position_changes');
expect(tools).toHaveProperty('set_time_cursor');
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/agent/tools.test.ts`
Expected: FAIL with missing tool properties

**Step 3: Write minimal implementation**

Update `src/agent/tools.ts`:

```ts
import { buildAnalysisIndex } from '../core/analysis-index.js';
import type { TimeCursor } from '../core/time-cursor.js';

export function makeTools({
  store,
  processors,
  timeCursor,
  onTimeCursorChange,
}: {
  store: SessionStore;
  processors: any;
  timeCursor: TimeCursor;
  onTimeCursorChange: (cursor: TimeCursor) => void;
}) {
  const analysisIndex = buildAnalysisIndex({ store, processors });
  const resolveCursor = (cursor?: TimeCursor | null) =>
    analysisIndex.resolveAsOf(cursor ?? timeCursor);

  return {
    // existing tools...
    set_time_cursor: tool({
      description: 'Set the as-of cursor for analysis (lap or ISO time).',
      inputSchema: z.object({ lap: z.number().optional(), iso: z.string().optional(), latest: z.boolean().optional() }),
      execute: async (cursor) => {
        const next = {
          lap: typeof cursor.lap === 'number' ? cursor.lap : undefined,
          iso: cursor.iso,
          latest: cursor.latest ?? false,
        } as TimeCursor;
        onTimeCursorChange(next);
        return analysisIndex.resolveAsOf(next);
      },
    }),
    get_stint_pace: tool({
      description: 'Get stint pace summary for a driver.',
      inputSchema: z.object({ driverNumber: z.string(), startLap: z.number().optional(), endLap: z.number().optional(), asOf: z.object({ lap: z.number().optional(), iso: z.string().optional() }).optional() }),
      execute: async ({ driverNumber, startLap, endLap }) =>
        analysisIndex.getStintPace({ driverNumber, startLap, endLap }),
    }),
    compare_drivers: tool({
      description: 'Compare two drivers lap-by-lap with summary.',
      inputSchema: z.object({ driverA: z.string(), driverB: z.string(), startLap: z.number().optional(), endLap: z.number().optional() }),
      execute: async ({ driverA, driverB, startLap, endLap }) =>
        analysisIndex.compareDrivers({ driverA, driverB, startLap, endLap }),
    }),
    get_undercut_window: tool({
      description: 'Compute undercut window from lap deltas and pit loss.',
      inputSchema: z.object({ driverA: z.string(), driverB: z.string(), pitLossMs: z.number().nullable() }),
      execute: async ({ driverA, driverB, pitLossMs }) =>
        analysisIndex.getUndercutWindow({ driverA, driverB, pitLossMs }),
    }),
    simulate_rejoin: tool({
      description: 'Project rejoin gap after a pit loss on a given lap.',
      inputSchema: z.object({ driver: z.string(), pitLossMs: z.number(), asOfLap: z.number() }),
      execute: async ({ driver, pitLossMs, asOfLap }) =>
        analysisIndex.simulateRejoin({ driver, pitLossMs, asOfLap }),
    }),
    get_position_changes: tool({
      description: 'List position changes by lap.',
      inputSchema: z.object({}),
      execute: async () => analysisIndex.getPositionChanges(),
    }),
  };
}
```

Update `src/agent/prompt.ts` to list new tools and add guidance:

```ts
- get_stint_pace, compare_drivers
- get_undercut_window, simulate_rejoin
- get_position_changes
- set_time_cursor

Rule: If the user says “as of lap X/time Y”, call set_time_cursor first, then answer.
```

**Step 4: Run test to verify it passes**

Run: `npm test -- src/agent/tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/agent/tools.ts src/agent/prompt.ts src/agent/tools.test.ts
git commit -m "feat: add post-session analysis tools"
```

---

### Task 8: UI as-of indicator

**Files:**
- Modify: `src/app.tsx`
- Modify: `src/tui/screens/EngineerChat.tsx`
- Modify: `src/tui/layout.ts`
- Test: `src/tui/layout.test.ts`

**Step 1: Write the failing test**

Update `src/tui/layout.test.ts`:

```ts
import { getSessionItems } from './layout.js';

it('includes as-of label when provided', () => {
  const items = getSessionItems({
    mode: 'full',
    year: 2024,
    meetingName: 'Test GP',
    sessionName: 'Race',
    sessionType: 'Race',
    summary: null,
    asOfLabel: 'Lap 12',
  });
  expect(items.some((item) => item.label === 'As of' && item.value === 'Lap 12')).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/tui/layout.test.ts`
Expected: FAIL with “asOfLabel does not exist”

**Step 3: Write minimal implementation**

Update `src/tui/layout.ts`:

```ts
export function getSessionItems({
  mode,
  year,
  meetingName,
  sessionName,
  sessionType,
  summary,
  asOfLabel,
}: {
  mode: RightPaneMode;
  year: number;
  meetingName: string;
  sessionName: string;
  sessionType: string;
  summary: SessionSummary | null;
  asOfLabel?: string | null;
}): StatItem[] {
  const items: StatItem[] = [
    { label: 'Year', value: String(year) },
    { label: 'Event', value: meetingName },
    { label: 'Session', value: `${sessionName} (${sessionType})` },
  ];
  if (asOfLabel) items.push({ label: 'As of', value: asOfLabel });
  // existing summary logic...
  return items;
}
```

Update `src/app.tsx` to track and pass cursor:

```ts
const [timeCursor, setTimeCursor] = useState<TimeCursor>({ latest: true });

// pass to makeTools
const tools = makeTools({
  store,
  processors: timingService.processors,
  timeCursor,
  onTimeCursorChange: setTimeCursor,
});
```

Update `src/tui/screens/EngineerChat.tsx` to accept `asOfLabel` prop and pass into `getSessionItems`:

```ts
export function EngineerChat({
  // ...
  asOfLabel,
}: {
  // ...
  asOfLabel?: string | null;
}) {
  const sessionItems = useMemo(() => {
    return getSessionItems({
      mode: rightPaneMode,
      year,
      meetingName: meeting.Name,
      sessionName: session.Name,
      sessionType: session.Type,
      summary,
      asOfLabel,
    });
  }, [rightPaneMode, year, meeting.Name, session.Name, session.Type, summary, asOfLabel]);
}
```

In `App`, compute a label from timeCursor:

```ts
const asOfLabel = timeCursor?.lap
  ? `Lap ${timeCursor.lap}`
  : timeCursor?.iso
    ? `Time ${timeCursor.iso}`
    : 'Latest';
```

Pass `asOfLabel` to `EngineerChat`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/tui/layout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app.tsx src/tui/screens/EngineerChat.tsx src/tui/layout.ts src/tui/layout.test.ts
git commit -m "feat: show time cursor in chat UI"
```

---

## Execution Options

Plan complete and saved to `docs/plans/2026-02-02-post-session-analytics-implementation-plan.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch a fresh subagent per task, review between tasks.
2. Parallel Session (separate) - Open a new session and use @superpowers:executing-plans to run tasks.

Which approach?
