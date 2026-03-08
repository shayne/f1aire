import { isPlainObject } from './processors/merge.js';

export type TyreStintSource = 'TyreStintSeries' | 'TimingAppData';
export type CurrentTyreSource = 'CurrentTyres' | TyreStintSource;

export type TyreStintRecord = {
  driverNumber: string;
  stint: number | null;
  compound: string | null;
  isNew: boolean | null;
  tyresNotChanged: boolean | null;
  startLaps: number | null;
  totalLaps: number | null;
  lapsOnTyre: number | null;
  lapTime: string | null;
  lapNumber: number | null;
  source: TyreStintSource;
};

export type CurrentTyreRecord = {
  driverNumber: string;
  position: number | null;
  compound: string | null;
  isNew: boolean | null;
  tyresNotChanged: boolean | null;
  stint: number | null;
  startLaps: number | null;
  totalLaps: number | null;
  lapsOnTyre: number | null;
  source: CurrentTyreSource;
};

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function toOrderedEntries(value: unknown): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((entry, index) => [String(index), entry]);
  }
  if (!isPlainObject(value)) {
    return [];
  }
  return Object.entries(value)
    .filter(([key]) => key !== '_kf')
    .sort(([left], [right]) => compareMaybeNumericStrings(left, right));
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toLapsOnTyre(startLaps: number | null, totalLaps: number | null) {
  if (startLaps !== null && totalLaps !== null) {
    return Math.max(0, totalLaps - startLaps);
  }
  return totalLaps;
}

function getTimingOrder(state: unknown): Map<string, number | null> {
  const lines = isPlainObject((state as { Lines?: unknown } | null)?.Lines)
    ? ((state as { Lines: Record<string, unknown> }).Lines ?? {})
    : {};
  const out = new Map<string, number | null>();
  for (const [driverNumber, raw] of Object.entries(lines)) {
    if (!isPlainObject(raw)) {
      continue;
    }
    const line = toOptionalNumber(raw.Position ?? raw.Line);
    out.set(driverNumber, line);
  }
  return out;
}

function buildDriverOrder(
  driverNumbers: Iterable<string>,
  timingDataState: unknown,
) {
  const order = getTimingOrder(timingDataState);
  return Array.from(new Set(driverNumbers)).sort((left, right) => {
    const leftOrder = order.get(left) ?? null;
    const rightOrder = order.get(right) ?? null;
    if (leftOrder !== null || rightOrder !== null) {
      if (leftOrder === null) return 1;
      if (rightOrder === null) return -1;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    return compareMaybeNumericStrings(left, right);
  });
}

function extractTimingAppDataMap(
  state: unknown,
): Map<string, TyreStintRecord[]> {
  const lines = isPlainObject((state as { Lines?: unknown } | null)?.Lines)
    ? ((state as { Lines: Record<string, unknown> }).Lines ?? {})
    : {};
  const out = new Map<string, TyreStintRecord[]>();
  for (const [driverNumber, rawLine] of Object.entries(lines)) {
    if (!isPlainObject(rawLine)) {
      continue;
    }
    const stints = toOrderedEntries(rawLine.Stints);
    const records = stints
      .map(([stintKey, raw]) =>
        buildTyreStintRecord(driverNumber, stintKey, raw, 'TimingAppData'),
      )
      .filter((record): record is TyreStintRecord => record !== null);
    if (records.length > 0) {
      out.set(driverNumber, records);
    }
  }
  return out;
}

function extractTyreStintSeriesMap(
  state: unknown,
): Map<string, TyreStintRecord[]> {
  const stints = isPlainObject((state as { Stints?: unknown } | null)?.Stints)
    ? ((state as { Stints: Record<string, unknown> }).Stints ?? {})
    : {};
  const out = new Map<string, TyreStintRecord[]>();
  for (const [driverNumber, rawDriverStints] of Object.entries(stints)) {
    const records = toOrderedEntries(rawDriverStints)
      .map(([stintKey, raw]) =>
        buildTyreStintRecord(driverNumber, stintKey, raw, 'TyreStintSeries'),
      )
      .filter((record): record is TyreStintRecord => record !== null);
    if (records.length > 0) {
      out.set(driverNumber, records);
    }
  }
  return out;
}

function buildTyreStintRecord(
  driverNumber: string,
  stintKey: string,
  raw: unknown,
  source: TyreStintSource,
): TyreStintRecord | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const startLaps = toOptionalNumber(raw.StartLaps);
  const totalLaps = toOptionalNumber(raw.TotalLaps);

  return {
    driverNumber,
    stint: toOptionalNumber(stintKey),
    compound: toOptionalString(raw.Compound),
    isNew: toOptionalBoolean(raw.New),
    tyresNotChanged: toOptionalBoolean(raw.TyresNotChanged),
    startLaps,
    totalLaps,
    lapsOnTyre: toLapsOnTyre(startLaps, totalLaps),
    lapTime: toOptionalString(raw.LapTime),
    lapNumber: toOptionalNumber(raw.LapNumber),
    source,
  };
}

function getCurrentTyresRoot(state: unknown): Record<string, unknown> {
  if (isPlainObject((state as { Tyres?: unknown } | null)?.Tyres)) {
    return (state as { Tyres: Record<string, unknown> }).Tyres;
  }
  if (isPlainObject(state)) {
    return state as Record<string, unknown>;
  }
  return {};
}

export function getTyreStintRecords(opts: {
  tyreStintSeriesState?: unknown;
  timingAppDataState?: unknown;
  timingDataState?: unknown;
  driverNumber?: string | number;
  asOfLap?: number;
}): TyreStintRecord[] {
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);
  const tyreStintSeries = extractTyreStintSeriesMap(opts.tyreStintSeriesState);
  const timingAppData = extractTimingAppDataMap(opts.timingAppDataState);
  const allDrivers = requestedDriver
    ? [requestedDriver]
    : buildDriverOrder(
        [...tyreStintSeries.keys(), ...timingAppData.keys()],
        opts.timingDataState,
      );

  const records: TyreStintRecord[] = [];
  for (const driverNumber of allDrivers) {
    const preferred = tyreStintSeries.get(driverNumber);
    const fallback = timingAppData.get(driverNumber);
    const selected =
      preferred && preferred.length > 0 ? preferred : (fallback ?? []);
    records.push(
      ...projectTyreStintsAsOf(selected, {
        asOfLap: opts.asOfLap,
      }),
    );
  }
  return records;
}

export function getCurrentTyreRecords(opts: {
  currentTyresState?: unknown;
  tyreStintSeriesState?: unknown;
  timingAppDataState?: unknown;
  timingDataState?: unknown;
  driverNumber?: string | number;
  asOfLap?: number;
}): CurrentTyreRecord[] {
  const requestedDriver =
    opts.driverNumber === undefined ? null : String(opts.driverNumber);
  const rawCurrentTyres = getCurrentTyresRoot(opts.currentTyresState);
  const currentTyres = new Map<string, Record<string, unknown>>();
  for (const [driverNumber, raw] of Object.entries(rawCurrentTyres)) {
    if (!isPlainObject(raw)) {
      continue;
    }
    currentTyres.set(driverNumber, raw);
  }

  const tyreStints = getTyreStintRecords(opts).reduce((map, record) => {
    const records = map.get(record.driverNumber) ?? [];
    records.push(record);
    map.set(record.driverNumber, records);
    return map;
  }, new Map<string, TyreStintRecord[]>());

  const allDrivers = requestedDriver
    ? [requestedDriver]
    : buildDriverOrder(
        [...currentTyres.keys(), ...tyreStints.keys()],
        opts.timingDataState,
      );
  const timingOrder = getTimingOrder(opts.timingDataState);

  return allDrivers
    .map((driverNumber) => {
      const current =
        opts.asOfLap === undefined
          ? (currentTyres.get(driverNumber) ?? null)
          : null;
      const fallback = tyreStints.get(driverNumber)?.slice(-1)[0] ?? null;
      if (!current && !fallback) {
        return null;
      }
      return {
        driverNumber,
        position: timingOrder.get(driverNumber) ?? null,
        compound:
          toOptionalString(current?.Compound) ?? fallback?.compound ?? null,
        isNew: toOptionalBoolean(current?.New) ?? fallback?.isNew ?? null,
        tyresNotChanged:
          toOptionalBoolean(current?.TyresNotChanged) ??
          fallback?.tyresNotChanged ??
          null,
        stint: fallback?.stint ?? null,
        startLaps: fallback?.startLaps ?? null,
        totalLaps: fallback?.totalLaps ?? null,
        lapsOnTyre: fallback?.lapsOnTyre ?? null,
        source: current ? 'CurrentTyres' : (fallback?.source ?? 'CurrentTyres'),
      } satisfies CurrentTyreRecord;
    })
    .filter((record): record is CurrentTyreRecord => record !== null);
}

function toNormalizedLap(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.trunc(value));
}

function projectTyreStintsAsOf(
  records: TyreStintRecord[],
  opts: { asOfLap?: number },
): TyreStintRecord[] {
  const asOfLap = toNormalizedLap(opts.asOfLap);
  if (asOfLap === null) {
    return records;
  }

  return records
    .filter((record, index) => {
      const recordLap = toNormalizedLap(record.lapNumber ?? undefined);
      if (recordLap !== null) {
        return recordLap <= asOfLap;
      }

      if (index === 0) {
        return true;
      }

      const startLap =
        record.startLaps === null ? null : Math.max(1, record.startLaps + 1);
      return startLap === null ? true : startLap <= asOfLap;
    })
    .slice();
}
