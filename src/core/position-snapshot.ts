import {
  decodeCarChannels,
  decodePositionEntry,
  getCarDataCars,
  getLatestCarDataEntry,
  getLatestPositionBatch,
  getPositionEntries,
  type DecodedCarChannels,
} from './feed-models.js';
import { isPlainObject } from './processors/merge.js';
import { PositionDataProcessor } from './processors/position-data.js';
import { CarDataProcessor } from './processors/car-data.js';
import { TimingDataProcessor } from './processors/timing-data.js';
import type { RawPoint } from './processors/types.js';
import { isTimingDataPointType } from './timing-data.js';
import { getTimingLineOrder } from './timing-data.js';

type DriverListState = Record<string, unknown> | null | undefined;

export type PositionSnapshotCoordinates = {
  x: number | null;
  y: number | null;
  z: number | null;
};

export type PositionSnapshotRecord = {
  driverNumber: string;
  driverName: string | null;
  timingPosition: number | null;
  status: string | null;
  offTrack: boolean | null;
  coordinates: PositionSnapshotCoordinates;
  telemetry: DecodedCarChannels | null;
};

export type PositionSnapshot = {
  positionTimestamp: string | null;
  telemetryUtc: string | null;
  totalDrivers: number;
  drivers: PositionSnapshotRecord[];
};

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
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
    toOptionalString(raw.FullName) ??
    toOptionalString(raw.BroadcastName) ??
    toOptionalString(raw.Tla) ??
    null
  );
}

function toOffTrackFlag(status: string | null): boolean | null {
  if (!status) {
    return null;
  }

  const normalized = status.trim().toLowerCase();
  if (
    normalized === 'offtrack' ||
    normalized === 'off_track' ||
    normalized === 'off track'
  ) {
    return true;
  }
  if (
    normalized === 'ontrack' ||
    normalized === 'on_track' ||
    normalized === 'on track'
  ) {
    return false;
  }
  return null;
}

function getTimingPositions(state: unknown) {
  const lines = isPlainObject((state as { Lines?: unknown } | null)?.Lines)
    ? ((state as { Lines: Record<string, unknown> }).Lines ?? {})
    : {};
  const out = new Map<string, number | null>();
  for (const [driverNumber, raw] of Object.entries(lines)) {
    out.set(driverNumber, getTimingLineOrder(raw));
  }
  return out;
}

function comparePositionSnapshotRecords(
  left: PositionSnapshotRecord,
  right: PositionSnapshotRecord,
) {
  if (left.timingPosition !== null || right.timingPosition !== null) {
    if (left.timingPosition === null) {
      return 1;
    }
    if (right.timingPosition === null) {
      return -1;
    }
    if (left.timingPosition !== right.timingPosition) {
      return left.timingPosition - right.timingPosition;
    }
  }

  return compareMaybeNumericStrings(left.driverNumber, right.driverNumber);
}

export function getPositionSnapshot(opts: {
  positionState?: unknown;
  carDataState?: unknown;
  driverListState?: DriverListState;
  timingDataState?: unknown;
  driverNumber?: string | number;
}): PositionSnapshot | null {
  const latestPosition = getLatestPositionBatch(opts.positionState ?? null);
  if (!latestPosition) {
    return null;
  }

  const latestCarData = getLatestCarDataEntry(opts.carDataState ?? null);
  const cars = getCarDataCars(latestCarData);
  const entries = getPositionEntries(latestPosition);
  const timingPositions = getTimingPositions(opts.timingDataState);
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);

  const drivers = Object.entries(entries)
    .filter(([driverNumber]) =>
      requestedDriver === null ? true : driverNumber === requestedDriver,
    )
    .map(([driverNumber, rawPosition]) => {
      const position = decodePositionEntry(rawPosition);
      const telemetry = decodeCarChannels(cars[driverNumber]?.Channels ?? null);

      return {
        driverNumber,
        driverName: getDriverName(opts.driverListState, driverNumber),
        timingPosition: timingPositions.get(driverNumber) ?? null,
        status: position?.status ?? null,
        offTrack: toOffTrackFlag(position?.status ?? null),
        coordinates: {
          x: position?.x ?? null,
          y: position?.y ?? null,
          z: position?.z ?? null,
        },
        telemetry,
      } satisfies PositionSnapshotRecord;
    })
    .sort(comparePositionSnapshotRecords);

  return {
    positionTimestamp: toOptionalString(latestPosition.Timestamp),
    telemetryUtc: toOptionalString(latestCarData?.Utc),
    totalDrivers: drivers.length,
    drivers,
  };
}

export function buildPositionSnapshotFromTimelines(opts: {
  positionTimeline?: RawPoint[];
  carDataTimeline?: RawPoint[];
  timingDataTimeline?: RawPoint[];
  driverListState?: DriverListState;
  timingDataState?: unknown;
  driverNumber?: string | number;
}): PositionSnapshot | null {
  const positionProcessor = new PositionDataProcessor();
  const carDataProcessor = new CarDataProcessor();
  const timingDataProcessor = new TimingDataProcessor();

  for (const point of [...(opts.positionTimeline ?? [])].sort(
    (left, right) => left.dateTime.getTime() - right.dateTime.getTime(),
  )) {
    positionProcessor.process(point);
  }

  for (const point of [...(opts.carDataTimeline ?? [])].sort(
    (left, right) => left.dateTime.getTime() - right.dateTime.getTime(),
  )) {
    carDataProcessor.process(point);
  }

  for (const point of [...(opts.timingDataTimeline ?? [])]
    .filter((entry) => isTimingDataPointType(entry.type))
    .sort(
      (left, right) => left.dateTime.getTime() - right.dateTime.getTime(),
    )) {
    timingDataProcessor.process(point);
  }

  return getPositionSnapshot({
    positionState: positionProcessor.state,
    carDataState: carDataProcessor.state,
    driverListState: opts.driverListState,
    timingDataState: timingDataProcessor.state ?? opts.timingDataState,
    driverNumber: opts.driverNumber,
  });
}
