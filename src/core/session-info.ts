import { isPlainObject } from './processors/merge.js';

const STATIC_BASE_URL = 'https://livetiming.formula1.com/static/';

type ObjectRecord = Record<string, unknown>;

export type SessionInfoCountrySummary = {
  Key: number | null;
  Code: string | null;
  Name: string | null;
};

export type SessionInfoCircuitSummary = {
  Key: number | null;
  ShortName: string | null;
};

export type SessionInfoMeetingSummary = {
  Key: number | null;
  Name: string | null;
  OfficialName: string | null;
  Location: string | null;
  Country: SessionInfoCountrySummary | null;
  Circuit: SessionInfoCircuitSummary | null;
};

export type SessionInfoCircuitCornerSummary = {
  number: number;
  x: number;
  y: number;
};

export type SessionInfoCircuitGeometrySummary = {
  pointCount: number;
  cornerCount: number;
  rotation: number | null;
  hasGeometry: boolean;
  sampleCorners: SessionInfoCircuitCornerSummary[];
};

export type SessionInfoSummary = {
  Key: number | null;
  Name: string | null;
  Type: string | null;
  Path: string | null;
  StaticPrefix: string | null;
  StartDate: string | null;
  EndDate: string | null;
  GmtOffset: string | null;
  ScheduledStartUtc: string | null;
  IsRace: boolean;
  IsQualifying: boolean;
  IsSprint: boolean;
  Meeting: SessionInfoMeetingSummary | null;
  CircuitGeometry: SessionInfoCircuitGeometrySummary;
};

function asObject(value: unknown): ObjectRecord | null {
  return isPlainObject(value) ? (value as ObjectRecord) : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toFiniteInteger(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function normalizeGmtOffset(value: unknown): string | null {
  const offset = asNonEmptyString(value);
  if (!offset) {
    return null;
  }

  if (/^[+-]\d{2}:\d{2}$/.test(offset)) {
    return offset;
  }

  if (/^[+-]\d{4}$/.test(offset)) {
    return `${offset.slice(0, 3)}:${offset.slice(3)}`;
  }

  return null;
}

function parseUtcIso(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function getSessionTypeText(value: unknown): string | null {
  const root = asObject(value);
  const direct = root ? root.Type : value;
  return asNonEmptyString(direct)?.toLowerCase() ?? null;
}

function getCircuitGeometrySummary(
  value: ObjectRecord,
): SessionInfoCircuitGeometrySummary {
  const pointCount = Array.isArray(value.CircuitPoints)
    ? value.CircuitPoints.length
    : 0;
  const sampleCorners = Array.isArray(value.CircuitCorners)
    ? value.CircuitCorners.map((item) => {
        const corner = asObject(item);
        if (!corner) {
          return null;
        }

        const number = toFiniteInteger(corner.number ?? corner.Number);
        const x = toFiniteNumber(corner.x ?? corner.X);
        const y = toFiniteNumber(corner.y ?? corner.Y);
        if (number === null || x === null || y === null) {
          return null;
        }

        return { number, x, y } satisfies SessionInfoCircuitCornerSummary;
      })
        .filter(
          (corner): corner is SessionInfoCircuitCornerSummary =>
            corner !== null,
        )
        .slice(0, 6)
    : [];

  return {
    pointCount,
    cornerCount: Array.isArray(value.CircuitCorners)
      ? value.CircuitCorners.length
      : 0,
    rotation: toFiniteInteger(value.CircuitRotation),
    hasGeometry:
      pointCount > 0 ||
      (Array.isArray(value.CircuitCorners) && value.CircuitCorners.length > 0),
    sampleCorners,
  };
}

export function getSessionInfoStaticPrefix(value: unknown): string | null {
  const root = asObject(value);
  const path = asNonEmptyString(root?.Path);
  if (!path) {
    return null;
  }

  if (/^https?:\/\//i.test(path)) {
    return path.endsWith('/') ? path : `${path}/`;
  }

  const normalized = path.replace(/^\/+/, '');
  return `${STATIC_BASE_URL}${normalized.endsWith('/') ? normalized : `${normalized}/`}`;
}

export function getSessionScheduledStartUtc(value: unknown): string | null {
  const root = asObject(value);
  const startDate = asNonEmptyString(root?.StartDate);
  if (!startDate) {
    return null;
  }

  const hasTimezone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(startDate);
  if (hasTimezone) {
    return parseUtcIso(startDate);
  }

  const offset = normalizeGmtOffset(root?.GmtOffset);
  if (!offset) {
    return null;
  }

  return parseUtcIso(`${startDate}${offset}`);
}

export function isRaceSession(value: unknown): boolean {
  return getSessionTypeText(value) === 'race';
}

export function isQualifyingSession(value: unknown): boolean {
  return getSessionTypeText(value) === 'qualifying';
}

export function isSprintSession(value: unknown): boolean {
  return getSessionTypeText(value) === 'sprint';
}

export function getSessionInfoSummary(
  value: unknown,
): SessionInfoSummary | null {
  const root = asObject(value);
  if (!root) {
    return null;
  }

  const meeting = asObject(root.Meeting);
  const country = asObject(meeting?.Country);
  const circuit = asObject(meeting?.Circuit);

  return {
    Key: toFiniteInteger(root.Key),
    Name: asNonEmptyString(root.Name),
    Type: asNonEmptyString(root.Type),
    Path: asNonEmptyString(root.Path),
    StaticPrefix: getSessionInfoStaticPrefix(root),
    StartDate: asNonEmptyString(root.StartDate),
    EndDate: asNonEmptyString(root.EndDate),
    GmtOffset: normalizeGmtOffset(root.GmtOffset),
    ScheduledStartUtc: getSessionScheduledStartUtc(root),
    IsRace: isRaceSession(root),
    IsQualifying: isQualifyingSession(root),
    IsSprint: isSprintSession(root),
    Meeting: meeting
      ? {
          Key: toFiniteInteger(meeting.Key),
          Name: asNonEmptyString(meeting.Name),
          OfficialName: asNonEmptyString(meeting.OfficialName),
          Location: asNonEmptyString(meeting.Location),
          Country: country
            ? {
                Key: toFiniteInteger(country.Key),
                Code: asNonEmptyString(country.Code),
                Name: asNonEmptyString(country.Name),
              }
            : null,
          Circuit: circuit
            ? {
                Key: toFiniteInteger(circuit.Key),
                ShortName: asNonEmptyString(circuit.ShortName),
              }
            : null,
        }
      : null,
    CircuitGeometry: getCircuitGeometrySummary(root),
  };
}
