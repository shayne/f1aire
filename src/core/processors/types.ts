export type RawPoint = { type: string; json: any; dateTime: Date };

export interface Processor<T = any> {
  latest: T | null;
  process: (point: RawPoint) => void;
}
