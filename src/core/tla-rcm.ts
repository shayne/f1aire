import { isPlainObject } from './processors/merge.js';

export const TLA_RCM_CATEGORIES = [
  'track-status',
  'track-limits',
  'investigation',
  'pit-lane',
  'session-control',
  'drs',
  'other',
] as const;

export type TlaRcmCategory = (typeof TLA_RCM_CATEGORIES)[number];

export type TlaRcmRecord = {
  eventId: string;
  timestamp: string | null;
  dateTime: Date | null;
  message: string | null;
  category: TlaRcmCategory;
  driverNumber: string | null;
  lap: number | null;
  sector: number | null;
  pit: boolean;
  raw: Record<string, unknown>;
};

export type TlaRcmSummary = {
  total: number;
  byCategory: Record<TlaRcmCategory, number>;
  driverCount: number;
  sectors: number[];
};

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return structuredClone(value) as T;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
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

function extractMessageNumber(
  message: string | null,
  pattern: RegExp,
): number | null {
  if (!message) {
    return null;
  }

  const match = message.match(pattern);
  if (!match?.[1]) {
    return null;
  }

  return toOptionalNumber(match[1]);
}

function inferCategory(message: string | null): TlaRcmCategory {
  const text = message?.toUpperCase() ?? '';
  if (!text) {
    return 'other';
  }

  if (text.includes('TRACK LIMITS') || text.includes('LAP DELETED')) {
    return 'track-limits';
  }
  if (
    text.includes('STEWARDS') ||
    text.includes('WILL BE INVESTIGATED') ||
    text.includes('INVOLVING CAR') ||
    text.includes('NOTED')
  ) {
    return 'investigation';
  }
  if (
    text.includes('PIT EXIT') ||
    text.includes('PIT LANE') ||
    text.includes('(PIT)')
  ) {
    return 'pit-lane';
  }
  if (text.includes('DRS') || text.includes('OVERTAKE ENABLED')) {
    return 'drs';
  }
  if (
    /\bQ[1-3]\b/.test(text) ||
    text.includes('SESSION') ||
    text.includes('WILL START') ||
    text.includes('WILL RESUME') ||
    text.includes('DELAYED')
  ) {
    return 'session-control';
  }
  if (
    text.includes('YELLOW') ||
    text.includes('RED FLAG') ||
    text.includes('GREEN FLAG') ||
    text.includes('GREEN LIGHT') ||
    text.includes('TRACK CLEAR') ||
    text.includes('CHEQUERED FLAG') ||
    text.includes('SAFETY CAR') ||
    text.includes('VIRTUAL SAFETY CAR')
  ) {
    return 'track-status';
  }

  return 'other';
}

function compareMaybeNumericStrings(left: string, right: string) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function compareTlaRcmRecords(left: TlaRcmRecord, right: TlaRcmRecord) {
  const leftMs = left.dateTime?.getTime() ?? null;
  const rightMs = right.dateTime?.getTime() ?? null;

  if (leftMs !== null || rightMs !== null) {
    if (leftMs === null) {
      return 1;
    }
    if (rightMs === null) {
      return -1;
    }
    if (leftMs !== rightMs) {
      return leftMs - rightMs;
    }
  }

  if (left.timestamp !== right.timestamp) {
    if (left.timestamp === null) {
      return 1;
    }
    if (right.timestamp === null) {
      return -1;
    }
    return left.timestamp.localeCompare(right.timestamp);
  }

  return compareMaybeNumericStrings(left.eventId, right.eventId);
}

function buildTlaRcmRecord(opts: {
  eventId: string;
  raw: unknown;
  dateTime?: Date | null;
}): TlaRcmRecord | null {
  const root = isPlainObject(opts.raw)
    ? cloneRecord(opts.raw as Record<string, unknown>)
    : typeof opts.raw === 'string'
      ? { Message: opts.raw }
      : null;

  if (!root) {
    return null;
  }

  const message =
    toOptionalString(root.Message) ??
    toOptionalString(root.Text) ??
    toOptionalString(root.Status);
  const timestamp =
    toOptionalString(root.Timestamp) ?? toOptionalString(root.Utc);

  if (!message && !timestamp) {
    return null;
  }

  return {
    eventId: opts.eventId,
    timestamp,
    dateTime: opts.dateTime ?? null,
    message,
    category: inferCategory(message),
    driverNumber:
      extractMessageNumber(message, /\bCAR\s+(\d{1,3})\b/i)?.toString() ?? null,
    lap:
      extractMessageNumber(message, /\bLAP\s+(\d{1,3})\b/i) ??
      toOptionalNumber(root.Lap),
    sector:
      extractMessageNumber(message, /\bTRACK SECTOR\s+(\d{1,2})\b/i) ??
      toOptionalNumber(root.Sector),
    pit: Boolean(message && /\(PIT\)|\bPIT EXIT\b|\bPIT LANE\b/i.test(message)),
    raw: root,
  };
}

export function getTlaRcmRecords(opts: {
  tlaRcmState?: unknown;
  timeline?: Array<{ json: unknown; dateTime?: Date | null }>;
}): TlaRcmRecord[] {
  const timelineRecords = (opts.timeline ?? [])
    .map((point, index) =>
      buildTlaRcmRecord({
        eventId: String(index),
        raw: point?.json,
        dateTime: point?.dateTime ?? null,
      }),
    )
    .filter((record): record is TlaRcmRecord => record !== null)
    .sort(compareTlaRcmRecords);

  if (timelineRecords.length > 0) {
    return timelineRecords;
  }

  const fallback = buildTlaRcmRecord({
    eventId: 'latest',
    raw: opts.tlaRcmState,
  });
  return fallback ? [fallback] : [];
}

export function summarizeTlaRcmRecords(records: TlaRcmRecord[]): TlaRcmSummary {
  const byCategory = Object.fromEntries(
    TLA_RCM_CATEGORIES.map((category) => [category, 0]),
  ) as Record<TlaRcmCategory, number>;
  const drivers = new Set<string>();
  const sectors = new Set<number>();

  for (const record of records) {
    byCategory[record.category] += 1;
    if (record.driverNumber) {
      drivers.add(record.driverNumber);
    }
    if (typeof record.sector === 'number') {
      sectors.add(record.sector);
    }
  }

  return {
    total: records.length,
    byCategory,
    driverCount: drivers.size,
    sectors: Array.from(sectors).sort((left, right) => left - right),
  };
}
