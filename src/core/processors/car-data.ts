import type { Processor, RawPoint } from './types.js';

type CarEntry = { Utc?: string; Cars?: Record<string, unknown> };
type CarState = { Entries: CarEntry[] };

export class CarDataProcessor implements Processor<CarState> {
  latest: CarState | null = null;
  state: CarState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'CarData') return;
    const entries = Array.isArray((point.json as any)?.Entries)
      ? ((point.json as any).Entries as CarEntry[])
      : [];
    if (!this.state) this.state = { Entries: [] };
    if (entries.length > 0) {
      this.state.Entries = [entries[entries.length - 1]];
    }
    this.latest = this.state;
  }
}
