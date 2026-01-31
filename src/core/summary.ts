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
    const entry = JSON.parse(line) as { type: string; json: any };
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
      (a, b) => Number(a[1].Position ?? 999) - Number(b[1].Position ?? 999),
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
