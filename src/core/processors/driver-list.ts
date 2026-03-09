import type { Processor, RawPoint } from './types.js';
import {
  getDriverListEntry,
  getDriverName,
  getDriverTeamName,
  type DriverListEntry,
  type DriverListState,
} from '../driver-list.js';
import { mergeDeep } from './merge.js';

export class DriverListProcessor implements Processor<DriverListState> {
  latest: DriverListState = null;
  state: DriverListState = null;

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

  getEntry(driverNumber: string | number): DriverListEntry | null {
    return getDriverListEntry(this.state, driverNumber);
  }

  getName(driverNumber: string): string | null {
    return getDriverName(this.state, driverNumber);
  }

  getTeamName(driverNumber: string): string | null {
    return getDriverTeamName(this.state, driverNumber);
  }
}
