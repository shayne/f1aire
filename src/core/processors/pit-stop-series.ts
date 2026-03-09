import {
  getPitStopSeriesRecords,
  mergePitStopSeriesState,
  type PitStopSeriesOrder,
  type PitStopSeriesRecord,
  type PitStopSeriesState,
} from '../pit-stop-series.js';
import type { Processor, RawPoint } from './types.js';

export class PitStopSeriesProcessor implements Processor<PitStopSeriesState> {
  latest: PitStopSeriesState | null = null;
  state: PitStopSeriesState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'PitStopSeries') {
      return;
    }

    this.state = mergePitStopSeriesState(this.state, point.json ?? null);
    this.latest = this.state;
  }

  getStops(
    opts: {
      driverNumber?: string | number;
      startLap?: number;
      endLap?: number;
      limit?: number;
      order?: PitStopSeriesOrder;
    } = {},
  ): PitStopSeriesRecord[] {
    return getPitStopSeriesRecords({
      state: this.state,
      driverNumber: opts.driverNumber,
      startLap: opts.startLap,
      endLap: opts.endLap,
      limit: opts.limit,
      order: opts.order,
    });
  }
}
