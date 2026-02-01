import type { Processor, RawPoint } from './types.js';
import { mergeDeep } from './merge.js';

export class DriverListProcessor implements Processor<Record<string, unknown>> {
  latest: Record<string, unknown> | null = null;
  state: Record<string, unknown> | null = null;

  process(point: RawPoint) {
    if (point.type !== 'DriverList') return;
    const patch = (point.json ?? {}) as Record<string, unknown>;
    if (!this.state) {
      this.state = structuredClone(patch);
    } else {
      mergeDeep(this.state, patch);
    }
    this.latest = this.state;
  }

  getName(driverNumber: string): string | null {
    const entry = this.state?.[driverNumber] as
      | { FullName?: string; BroadcastName?: string; Tla?: string }
      | undefined;
    return entry?.FullName ?? entry?.BroadcastName ?? entry?.Tla ?? null;
  }
}
