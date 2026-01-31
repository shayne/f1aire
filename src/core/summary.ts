export type Summary = {
  winner: { number: string; name: string } | null;
  fastestLap: { number: string; name: string; time: string } | null;
  totalLaps: number | null;
};

type TimingEntry = {
  Position?: string;
  BestLapTime?: { Value?: string };
};

type TimingLines = Record<string, TimingEntry>;

type BestLap = { num: string; timeMs: number; time: string };

export function summarizeFromLines(raw: string): Summary {
  const driverNames = new Map<string, string>();
  let latestTiming: TimingLines = {};
  let totalLaps: number | null = null;
  let bestLap: BestLap | null = null;

  for (const line of raw.split('\n').filter((value) => value.trim().length > 0)) {
    let entry: { type: string; json: any } | null = null;
    try {
      entry = JSON.parse(line) as { type: string; json: any };
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'DriverList') {
      for (const [num, data] of Object.entries(entry.json ?? {})) {
        const name = (data as { FullName?: string; BroadcastName?: string }).FullName
          ?? (data as { FullName?: string; BroadcastName?: string }).BroadcastName;
        if (name) driverNames.set(num, name);
      }
    }
    if (entry.type === 'TimingData') {
      latestTiming = (entry.json?.Lines as TimingLines) ?? latestTiming;
      for (const [num, driver] of Object.entries(latestTiming)) {
        const time = driver.BestLapTime?.Value;
        if (!time) continue;
        const ms = parseLapTimeMs(time);
        if (ms !== null && (!bestLap || ms < bestLap.timeMs)) {
          bestLap = { num, timeMs: ms, time };
        }
      }
    }
    if (entry.type === 'LapCount') {
      const value = entry.json?.TotalLaps as number | undefined;
      if (typeof value === 'number') totalLaps = value;
    }
  }

  const winnerNum = Object.entries(latestTiming)
    .sort(
      (a, b) => parsePositionValue(a[1].Position) - parsePositionValue(b[1].Position),
    )
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

function parsePositionValue(position?: string): number {
  if (!position) return 999;
  const trimmed = position.trim();
  if (!trimmed) return 999;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : 999;
}

export function parseLapTimeMs(value: string): number | null {
  const parts = value.split(':');
  if (parts.length === 1) {
    const [sec, ms] = parts[0].split('.');
    if (!sec || !ms) return null;
    const secValue = Number(sec);
    const msValue = Number(ms);
    if (!Number.isFinite(secValue) || !Number.isFinite(msValue)) return null;
    return secValue * 1000 + msValue;
  }
  if (parts.length === 2) {
    const [min, rest] = parts;
    const [sec, ms] = rest.split('.');
    if (!min || !sec || !ms) return null;
    const minValue = Number(min);
    const secValue = Number(sec);
    const msValue = Number(ms);
    if (!Number.isFinite(minValue) || !Number.isFinite(secValue) || !Number.isFinite(msValue)) {
      return null;
    }
    return minValue * 60000 + secValue * 1000 + msValue;
  }
  return null;
}
