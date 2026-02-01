import type { Processor, RawPoint } from './types.js';
import { parseLapTimeMs } from '../summary.js';
import { mergeDeep } from './merge.js';

type BestLap = { time: string; timeMs: number };
type TimingLine = Record<string, unknown>;
type TimingState = { Lines?: Record<string, TimingLine> } & Record<string, unknown>;

export class TimingDataProcessor implements Processor<TimingState> {
  latest: TimingState | null = null;
  state: TimingState | null = null;
  bestLaps = new Map<string, BestLap>();
  driversByLap = new Map<number, Map<string, TimingLine>>();

  getLapHistory(driverNumber: string) {
    const history: { lap: number; snapshot: TimingLine }[] = [];
    for (const [lap, drivers] of this.driversByLap.entries()) {
      const snap = drivers.get(driverNumber);
      if (snap) history.push({ lap, snapshot: snap });
    }
    history.sort((a, b) => a.lap - b.lap);
    return history;
  }

  getLapSnapshot(driverNumber: string, lap: number) {
    return this.driversByLap.get(lap)?.get(driverNumber) ?? null;
  }

  getLapNumbers() {
    return Array.from(this.driversByLap.keys()).sort((a, b) => a - b);
  }

  process(point: RawPoint) {
    if (point.type !== 'TimingData') return;
    const patch = point.json ?? {};
    if (!this.state) {
      this.state = structuredClone(patch) as TimingState;
    } else {
      mergeDeep(this.state as Record<string, unknown>, patch);
    }
    this.latest = this.state;
    const patchLines = (patch as TimingState).Lines ?? {};
    const mergedLines = this.state.Lines ?? {};
    for (const [num, partial] of Object.entries(patchLines)) {
      const merged = mergedLines[num];
      if (!merged) continue;
      const driver = merged as any;
      const partialDriver = partial as any;
      const sessionPart = (this.state as any)?.SessionPart;
      if (sessionPart && driver.SessionPart !== sessionPart) {
        driver.SessionPart = sessionPart;
      }
      if (partialDriver?.PitOut || partialDriver?.InPit) {
        driver.IsPitLap = true;
      } else if (driver.IsPitLap && !driver.PitOut && !driver.InPit) {
        driver.IsPitLap = false;
      }
      const lapNumber = (partial as any).NumberOfLaps;
      if (typeof lapNumber === 'number') {
        const lapDrivers = this.driversByLap.get(lapNumber) ?? new Map();
        if (!this.driversByLap.has(lapNumber)) this.driversByLap.set(lapNumber, lapDrivers);
        const snap = structuredClone(merged) as TimingLine;
        (snap as any).__dateTime = point.dateTime;
        lapDrivers.set(num, snap);
      }
      const time = driver?.BestLapTime?.Value;
      if (!time) continue;
      const ms = parseLapTimeMs(time);
      if (ms === null) continue;
      const current = this.bestLaps.get(num);
      if (!current || ms < current.timeMs) this.bestLaps.set(num, { time, timeMs: ms });
    }
  }
}
