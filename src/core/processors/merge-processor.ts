import type { Processor, RawPoint } from './types.js';
import { isPlainObject, mergeDeep } from './merge.js';

export class MergeProcessor<T extends Record<string, unknown> = Record<string, unknown>>
  implements Processor<T>
{
  latest: T | null = null;
  state: T | null = null;
  private readonly matchType: string;

  constructor(matchType: string) {
    this.matchType = matchType;
  }

  process(point: RawPoint) {
    if (point.type !== this.matchType) return;
    const patch = (point.json ?? {}) as T;
    if (!this.state) {
      this.state = structuredClone(patch) as T;
    } else if (isPlainObject(patch)) {
      mergeDeep(this.state as Record<string, unknown>, patch as Record<string, unknown>);
    } else {
      this.state = structuredClone(patch) as T;
    }
    this.latest = this.state;
  }
}
