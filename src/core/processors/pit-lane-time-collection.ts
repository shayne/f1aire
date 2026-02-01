import type { Processor, RawPoint } from './types.js';

type PitTime = Record<string, unknown>;
type PitLaneState = {
  PitTimes?: Record<string, PitTime>;
  PitTimesList?: Record<string, PitTime[]>;
};

export class PitLaneTimeCollectionProcessor implements Processor<PitLaneState> {
  latest: PitLaneState | null = null;
  state: PitLaneState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'PitLaneTimeCollection') return;
    const pitTimes = (point.json as any)?.PitTimes as
      | Record<string, PitTime>
      | undefined;
    if (!this.state) this.state = { PitTimes: {}, PitTimesList: {} };
    if (pitTimes && typeof pitTimes === 'object') {
      for (const [driver, pit] of Object.entries(pitTimes)) {
        if (driver === '_deleted') continue;
        const list = this.state.PitTimesList ?? {};
        const arr = list[driver] ?? [];
        arr.push(pit);
        list[driver] = arr;
        this.state.PitTimesList = list;
        const latest = this.state.PitTimes ?? {};
        latest[driver] = pit;
        this.state.PitTimes = latest;
      }
    }
    this.latest = this.state;
  }
}
