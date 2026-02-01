import type { Processor, RawPoint } from './types.js';
import { isPlainObject, mergeDeep } from './merge.js';

type TrackStatusState = Record<string, unknown>;

type TrackStatusEntry = {
  at: Date;
  value: TrackStatusState;
  status: string | null;
  message: string | null;
};

export class TrackStatusProcessor implements Processor<TrackStatusState> {
  latest: TrackStatusState | null = null;
  state: TrackStatusState | null = null;
  history: TrackStatusEntry[] = [];

  process(point: RawPoint) {
    if (point.type !== 'TrackStatus') return;
    const patch = (point.json ?? {}) as TrackStatusState;
    if (!this.state) {
      this.state = structuredClone(patch) as TrackStatusState;
    } else if (isPlainObject(patch)) {
      mergeDeep(this.state as Record<string, unknown>, patch as Record<string, unknown>);
    } else {
      this.state = structuredClone(patch) as TrackStatusState;
    }
    this.latest = this.state;

    const status = normalizeStatus((this.state as any)?.Status);
    const message = normalizeMessage((this.state as any)?.Message);
    const last = this.history[this.history.length - 1];
    if (!last || last.status !== status || last.message !== message) {
      this.history.push({
        at: point.dateTime,
        value: structuredClone(this.state) as TrackStatusState,
        status,
        message,
      });
    }
  }

  getAt(dateTime: Date): TrackStatusState | null {
    for (let i = this.history.length - 1; i >= 0; i -= 1) {
      if (this.history[i].at.getTime() <= dateTime.getTime()) {
        return this.history[i].value;
      }
    }
    return this.latest;
  }
}

function normalizeStatus(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function normalizeMessage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}
