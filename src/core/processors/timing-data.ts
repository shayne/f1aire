import type { Processor, RawPoint } from './types.js';
import { parseLapTimeMs } from '../summary.js';
import { mergeDeep } from './merge.js';
import {
  getTimingLineBestLapTime,
  getTimingLineBestLapNumber,
  getTimingLineLapNumber,
  getTimingLinesRoot,
  getTimingSessionPart,
  isTimingDataPointType,
  isTimingFlagActive,
  type TimingLine,
  type TimingState,
} from '../timing-data.js';

type BestLap = {
  time: string;
  timeMs: number;
  lap: number | null;
  snapshot: TimingLine;
};

export class TimingDataProcessor implements Processor<TimingState> {
  latest: TimingState | null = null;
  state: TimingState | null = null;
  bestLaps = new Map<string, BestLap>();
  driversByLap = new Map<number, Map<string, TimingLine>>();
  currentLapByDriver = new Map<string, number>();

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

  getBestLapSnapshot(driverNumber: string) {
    return this.bestLaps.get(driverNumber) ?? null;
  }

  getLapNumbers() {
    return Array.from(this.driversByLap.keys()).sort((a, b) => a - b);
  }

  process(point: RawPoint) {
    if (!isTimingDataPointType(point.type)) return;

    const patch = point.json ?? {};
    if (!this.state) {
      this.state = structuredClone(patch) as TimingState;
    } else {
      mergeDeep(this.state as Record<string, unknown>, patch);
    }
    this.latest = this.state;
    const patchLines = getTimingLinesRoot(patch);
    const mergedLines = getTimingLinesRoot(this.state);
    for (const [num, partial] of Object.entries(patchLines)) {
      const merged = mergedLines[num];
      if (!merged) continue;
      const sessionPart = getTimingSessionPart(this.state);
      if (sessionPart !== null && merged.SessionPart !== sessionPart) {
        merged.SessionPart = sessionPart;
      }
      if (
        isTimingFlagActive(partial.PitOut) ||
        isTimingFlagActive(partial.InPit)
      ) {
        merged.IsPitLap = true;
      }
      const lapNumber = getTimingLineLapNumber(merged);
      const lapUpdate = getTimingLineLapNumber(partial);
      if (lapNumber !== null) {
        this.currentLapByDriver.set(num, lapNumber);
      }
      const currentLap = lapNumber ?? this.currentLapByDriver.get(num) ?? null;
      if (lapUpdate !== null) {
        const lapDrivers = this.driversByLap.get(lapUpdate) ?? new Map();
        if (!this.driversByLap.has(lapUpdate)) {
          this.driversByLap.set(lapUpdate, lapDrivers);
        }
        const snap = structuredClone(merged) as TimingLine;
        snap.__dateTime = point.dateTime;
        lapDrivers.set(num, snap);

        if (
          isTimingFlagActive(merged.IsPitLap) &&
          !isTimingFlagActive(snap.PitOut) &&
          !isTimingFlagActive(snap.InPit)
        ) {
          merged.IsPitLap = false;
        }
      }

      const time = getTimingLineBestLapTime(merged);
      if (!time) {
        this.bestLaps.delete(num);
        continue;
      }

      const ms = parseLapTimeMs(time);
      if (ms === null) continue;
      const current = this.bestLaps.get(num);
      if (!current || ms < current.timeMs) {
        const bestLapSnapshot = structuredClone(merged) as TimingLine;
        bestLapSnapshot.__dateTime = point.dateTime;
        this.bestLaps.set(num, {
          time,
          timeMs: ms,
          lap: getTimingLineBestLapNumber(merged) ?? currentLap,
          snapshot: bestLapSnapshot,
        });
      }
    }
  }
}
