import { isPlainObject } from './processors/merge.js';

export type DriverListEntry = Record<string, unknown> & {
  RacingNumber?: string | number | null;
  BroadcastName?: string | null;
  FullName?: string | null;
  Tla?: string | null;
  TeamName?: string | null;
  TeamColour?: string | number | null;
};

export type DriverListState = Record<string, unknown> | null | undefined;

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function toText(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDriverListEntries(
  state: unknown,
): Array<[string, DriverListEntry]> {
  if (!isPlainObject(state)) {
    return [];
  }

  return Object.entries(state)
    .filter(
      ([driverNumber, entry]) => driverNumber !== '_kf' && isPlainObject(entry),
    )
    .sort(([left], [right]) =>
      compareMaybeNumericStrings(left, right),
    ) as Array<[string, DriverListEntry]>;
}

export function getDriverListEntry(
  state: DriverListState,
  driverNumber: string | number,
): DriverListEntry | null {
  if (!isPlainObject(state)) {
    return null;
  }

  const entry = state[String(driverNumber)];
  return isPlainObject(entry) ? (entry as DriverListEntry) : null;
}

export function getDriverNameFromEntry(entry: unknown): string | null {
  if (!isPlainObject(entry)) {
    return null;
  }

  return (
    toText(entry.FullName) ??
    toText(entry.BroadcastName) ??
    toText(entry.Tla) ??
    null
  );
}

export function getDriverTeamNameFromEntry(entry: unknown): string | null {
  if (!isPlainObject(entry)) {
    return null;
  }

  return toText(entry.TeamName);
}

export function getDriverTeamColourFromEntry(entry: unknown): string | null {
  if (!isPlainObject(entry)) {
    return null;
  }

  return toText(entry.TeamColour);
}

export function getDriverName(
  state: DriverListState,
  driverNumber: string | number,
): string | null {
  return getDriverNameFromEntry(getDriverListEntry(state, driverNumber));
}

export function getDriverTeamName(
  state: DriverListState,
  driverNumber: string | number,
): string | null {
  return getDriverTeamNameFromEntry(getDriverListEntry(state, driverNumber));
}

export function getDriverTeamColour(
  state: DriverListState,
  driverNumber: string | number,
): string | null {
  return getDriverTeamColourFromEntry(getDriverListEntry(state, driverNumber));
}

export function findDriverNumberByName(
  state: DriverListState,
  query: string,
): string | null {
  const needle = toText(query)?.toLowerCase();
  if (!needle) {
    return null;
  }

  for (const [driverNumber, entry] of getDriverListEntries(state)) {
    if (driverNumber.toLowerCase() === needle) {
      return driverNumber;
    }

    const fullName = toText(entry.FullName)?.toLowerCase();
    const broadcastName = toText(entry.BroadcastName)?.toLowerCase();
    const tla = toText(entry.Tla)?.toLowerCase();

    if (tla === needle) {
      return driverNumber;
    }
    if (fullName?.includes(needle) || broadcastName?.includes(needle)) {
      return driverNumber;
    }
  }

  return null;
}
