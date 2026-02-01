import type { Processor, RawPoint } from './types.js';

type PositionEntry = { Timestamp?: string; Entries?: Record<string, unknown> };
type PositionState = { Position: PositionEntry[] };

export class PositionDataProcessor implements Processor<PositionState> {
  latest: PositionState | null = null;
  state: PositionState | null = null;

  process(point: RawPoint) {
    if (point.type !== 'Position') return;
    const updates = Array.isArray((point.json as any)?.Position)
      ? ((point.json as any).Position as PositionEntry[])
      : [];
    if (!this.state) this.state = { Position: [] };
    if (this.state.Position.length === 0) {
      this.state.Position.push({ Entries: {} });
    }
    const current = this.state.Position[this.state.Position.length - 1];
    for (const update of updates) {
      if (update?.Entries && typeof update.Entries === 'object') {
        current.Entries = {
          ...(current.Entries ?? {}),
          ...(update.Entries ?? {}),
        };
      }
      if (update?.Timestamp) current.Timestamp = update.Timestamp;
    }
    this.latest = this.state;
  }
}
