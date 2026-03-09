import { isPlainObject } from './processors/merge.js';

const WEATHER_NUMERIC_KEYS = [
  'AirTemp',
  'Humidity',
  'Pressure',
  'Rainfall',
  'TrackTemp',
  'WindDirection',
  'WindSpeed',
] as const;

type WeatherNumericKey = (typeof WEATHER_NUMERIC_KEYS)[number];

export type WeatherDataState = Record<string, unknown> & {
  Timestamp?: string | null;
  Weather?: Record<string, unknown>;
} & Partial<Record<WeatherNumericKey, number | null>>;

export type WeatherSnapshot = {
  timestamp: string | null;
  airTempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  rainfall: number | null;
  trackTempC: number | null;
  windDirectionDeg: number | null;
  windSpeed: number | null;
};

function asRecord<T extends Record<string, unknown> = Record<string, unknown>>(
  value: unknown,
): T | null {
  return isPlainObject(value) ? (value as T) : null;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalIsoString(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = new Date(trimmed);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function getWeatherPayload(value: unknown): Record<string, unknown> | null {
  const root = asRecord(value);
  if (!root) {
    return null;
  }
  return asRecord(root.Weather) ?? root;
}

function normalizeNumericFields(target: Record<string, unknown>) {
  for (const key of WEATHER_NUMERIC_KEYS) {
    const normalized = toOptionalNumber(target[key]);
    if (normalized === null) {
      delete target[key];
    } else {
      target[key] = normalized;
    }
  }
}

export function getWeatherSnapshot(value: unknown): WeatherSnapshot | null {
  const root = asRecord(value);
  const weather = getWeatherPayload(value);
  if (!root || !weather) {
    return null;
  }

  return {
    timestamp: toOptionalIsoString(root.Timestamp),
    airTempC: toOptionalNumber(weather.AirTemp),
    humidityPct: toOptionalNumber(weather.Humidity),
    pressureHpa: toOptionalNumber(weather.Pressure),
    rainfall: toOptionalNumber(weather.Rainfall),
    trackTempC: toOptionalNumber(weather.TrackTemp),
    windDirectionDeg: toOptionalNumber(weather.WindDirection),
    windSpeed: toOptionalNumber(weather.WindSpeed),
  };
}

export function replaceWeatherDataState(value: unknown): WeatherDataState | null {
  const root = asRecord<WeatherDataState>(value);
  if (!root) {
    return null;
  }

  const next = structuredClone(root) as Record<string, unknown>;
  const weather = asRecord(next.Weather) ?? next;

  normalizeNumericFields(weather);

  const timestamp = toOptionalIsoString(next.Timestamp);
  if (timestamp === null) {
    delete next.Timestamp;
  } else {
    next.Timestamp = timestamp;
  }

  return next as WeatherDataState;
}
