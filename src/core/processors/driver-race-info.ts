import {
  getDriverRaceInfoRows,
  mergeDriverRaceInfoState,
  type DriverRaceInfoState,
} from '../driver-race-info.js';
import type { Processor, RawPoint } from './types.js';

export class DriverRaceInfoProcessor implements Processor<DriverRaceInfoState> {
  latest: DriverRaceInfoState | null = null;
  state: DriverRaceInfoState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'DriverRaceInfo') {
      return;
    }

    this.state = mergeDriverRaceInfoState(this.state, point.json ?? null);
    this.latest = this.state;
  }

  getDriver(driverNumber: string | number) {
    return this.state?.[String(driverNumber)] ?? null;
  }

  getRows(
    opts: {
      driverListState?: Record<string, unknown> | null;
      driverNumber?: string | number;
    } = {},
  ) {
    return getDriverRaceInfoRows({
      state: this.state,
      driverListState: opts.driverListState,
      driverNumber: opts.driverNumber,
    });
  }
}
