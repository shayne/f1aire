import { parseGapSeconds, parseIntervalSeconds } from './analysis-utils.js';
import { isPlainObject, mergeDeep } from './processors/merge.js';

type DriverRaceInfoRawValue = string | number | boolean | null;

export type DriverRaceInfoEntry = Record<string, unknown> & {
  Position?: string | number | null;
  Gap?: string | number | null;
  Interval?: string | number | null;
  PitStops?: string | number | null;
  Catching?: DriverRaceInfoRawValue;
  OvertakeState?: DriverRaceInfoRawValue;
};

export type DriverRaceInfoState = Record<string, DriverRaceInfoEntry>;

export type DriverRaceInfoRow = {
  driverNumber: string;
  driverName: string | null;
  position: number | null;
  gap: string | null;
  gapSeconds: number | null;
  interval: string | null;
  intervalSeconds: number | null;
  pitStops: number | null;
  catching: DriverRaceInfoRawValue;
  overtakeState: DriverRaceInfoRawValue;
  raw: DriverRaceInfoEntry;
};

type DriverListState = Record<string, unknown> | null | undefined;

function cloneState(state: DriverRaceInfoState): DriverRaceInfoState {
  return structuredClone(state) as DriverRaceInfoState;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toRawScalar(value: unknown): DriverRaceInfoRawValue {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function getDriverName(driverListState: DriverListState, driverNumber: string) {
  if (!isPlainObject(driverListState)) {
    return null;
  }
  const raw = driverListState[driverNumber];
  if (!isPlainObject(raw)) {
    return null;
  }
  return (
    toText(raw.FullName) ?? toText(raw.BroadcastName) ?? toText(raw.Tla) ?? null
  );
}

export function mergeDriverRaceInfoState(
  current: DriverRaceInfoState | null,
  patch: unknown,
): DriverRaceInfoState | null {
  if (!isPlainObject(patch)) {
    return current ? cloneState(current) : null;
  }

  const next = current ? cloneState(current) : {};
  mergeDeep(next as Record<string, unknown>, patch as Record<string, unknown>);
  return next;
}

export function buildDriverRaceInfoState(opts: {
  baseState?: unknown;
  timeline?: Array<{ json: unknown }>;
}): DriverRaceInfoState | null {
  let state = mergeDriverRaceInfoState(null, opts.baseState ?? null);
  for (const point of opts.timeline ?? []) {
    state = mergeDriverRaceInfoState(state, point?.json ?? null);
  }
  return state;
}

export function getDriverRaceInfoRows(opts: {
  state: unknown;
  driverListState?: DriverListState;
  driverNumber?: string | number;
}): DriverRaceInfoRow[] {
  const root = isPlainObject(opts.state) ? opts.state : null;
  if (!root) {
    return [];
  }

  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);

  const rows = Object.entries(root)
    .filter(([driverNumber, raw]) => {
      if (driverNumber === '_kf') {
        return false;
      }
      if (!isPlainObject(raw)) {
        return false;
      }
      if (requestedDriver !== null && driverNumber !== requestedDriver) {
        return false;
      }
      return true;
    })
    .map(([driverNumber, raw]) => {
      const entry = raw as DriverRaceInfoEntry;
      const gap = toText(entry.Gap);
      const interval = toText(entry.Interval);
      return {
        driverNumber,
        driverName: getDriverName(opts.driverListState, driverNumber),
        position: toNumber(entry.Position),
        gap,
        gapSeconds: parseGapSeconds(gap),
        interval,
        intervalSeconds: parseIntervalSeconds(interval),
        pitStops: toNumber(entry.PitStops),
        catching: toRawScalar(entry.Catching),
        overtakeState: toRawScalar(entry.OvertakeState),
        raw: structuredClone(entry) as DriverRaceInfoEntry,
      } satisfies DriverRaceInfoRow;
    });

  rows.sort((left, right) => {
    const leftPosition = left.position ?? Number.POSITIVE_INFINITY;
    const rightPosition = right.position ?? Number.POSITIVE_INFINITY;
    if (leftPosition !== rightPosition) {
      return leftPosition - rightPosition;
    }
    return left.driverNumber.localeCompare(right.driverNumber, undefined, {
      numeric: true,
    });
  });

  return rows;
}
