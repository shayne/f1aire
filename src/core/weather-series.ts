import { isPlainObject } from './processors/merge.js';

export type WeatherSampleSource = 'WeatherDataSeries' | 'WeatherData';

export type WeatherSampleRecord = {
  sampleId: string;
  timestamp: string | null;
  airTempC: number | null;
  humidityPct: number | null;
  pressureHpa: number | null;
  rainfall: number | null;
  trackTempC: number | null;
  windDirectionDeg: number | null;
  windSpeed: number | null;
  source: WeatherSampleSource;
};

export type WeatherTrendSummary = {
  samples: number;
  fromTime: string | null;
  toTime: string | null;
  airTempStartC: number | null;
  airTempEndC: number | null;
  airTempDeltaC: number | null;
  trackTempStartC: number | null;
  trackTempEndC: number | null;
  trackTempDeltaC: number | null;
  minAirTempC: number | null;
  maxAirTempC: number | null;
  minTrackTempC: number | null;
  maxTrackTempC: number | null;
  rainfallSamples: number;
  maxWindSpeed: number | null;
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

function toOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseIsoMs(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function buildWeatherSampleRecord(opts: {
  sampleId: string;
  raw: unknown;
  source: WeatherSampleSource;
  fallbackTimestamp?: string | null;
}): WeatherSampleRecord | null {
  if (!isPlainObject(opts.raw)) {
    return null;
  }

  const weather = isPlainObject(opts.raw.Weather) ? opts.raw.Weather : opts.raw;
  const timestamp =
    toOptionalString(opts.raw.Timestamp) ?? opts.fallbackTimestamp ?? null;

  return {
    sampleId: opts.sampleId,
    timestamp,
    airTempC: toOptionalNumber(weather.AirTemp),
    humidityPct: toOptionalNumber(weather.Humidity),
    pressureHpa: toOptionalNumber(weather.Pressure),
    rainfall: toOptionalNumber(weather.Rainfall),
    trackTempC: toOptionalNumber(weather.TrackTemp),
    windDirectionDeg: toOptionalNumber(weather.WindDirection),
    windSpeed: toOptionalNumber(weather.WindSpeed),
    source: opts.source,
  };
}

function byTimestampAscending(left: WeatherSampleRecord, right: WeatherSampleRecord) {
  const leftMs = parseIsoMs(left.timestamp);
  const rightMs = parseIsoMs(right.timestamp);
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
  return compareMaybeNumericStrings(left.sampleId, right.sampleId);
}

function pickMin(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length === 0) {
    return null;
  }
  return Math.min(...filtered);
}

function pickMax(values: Array<number | null>) {
  const filtered = values.filter((value): value is number => value !== null);
  if (filtered.length === 0) {
    return null;
  }
  return Math.max(...filtered);
}

function delta(start: number | null, end: number | null) {
  if (start === null || end === null) {
    return null;
  }
  return end - start;
}

export function getWeatherSeriesRecords(opts: {
  weatherDataSeriesState?: unknown;
  weatherDataState?: unknown;
  weatherDataTimestamp?: string | Date | null;
}): WeatherSampleRecord[] {
  const rawSeries = (opts.weatherDataSeriesState as { Series?: unknown } | null)
    ?.Series;
  const seriesRecords = toOrderedEntries(rawSeries)
    .map(([sampleId, raw]) =>
      buildWeatherSampleRecord({
        sampleId,
        raw,
        source: 'WeatherDataSeries',
      }),
    )
    .filter((record): record is WeatherSampleRecord => record !== null)
    .sort(byTimestampAscending);

  if (seriesRecords.length > 0) {
    return seriesRecords;
  }

  const fallbackTimestamp =
    opts.weatherDataTimestamp instanceof Date
      ? opts.weatherDataTimestamp.toISOString()
      : toOptionalString(opts.weatherDataTimestamp);
  const fallback = buildWeatherSampleRecord({
    sampleId: 'latest',
    raw: opts.weatherDataState,
    source: 'WeatherData',
    fallbackTimestamp,
  });
  return fallback ? [fallback] : [];
}

export function summarizeWeatherSeries(
  records: WeatherSampleRecord[],
): WeatherTrendSummary | null {
  if (records.length === 0) {
    return null;
  }

  const ordered = [...records].sort(byTimestampAscending);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  return {
    samples: ordered.length,
    fromTime: first?.timestamp ?? null,
    toTime: last?.timestamp ?? null,
    airTempStartC: first?.airTempC ?? null,
    airTempEndC: last?.airTempC ?? null,
    airTempDeltaC: delta(first?.airTempC ?? null, last?.airTempC ?? null),
    trackTempStartC: first?.trackTempC ?? null,
    trackTempEndC: last?.trackTempC ?? null,
    trackTempDeltaC: delta(first?.trackTempC ?? null, last?.trackTempC ?? null),
    minAirTempC: pickMin(ordered.map((record) => record.airTempC)),
    maxAirTempC: pickMax(ordered.map((record) => record.airTempC)),
    minTrackTempC: pickMin(ordered.map((record) => record.trackTempC)),
    maxTrackTempC: pickMax(ordered.map((record) => record.trackTempC)),
    rainfallSamples: ordered.filter((record) => (record.rainfall ?? 0) > 0).length,
    maxWindSpeed: pickMax(ordered.map((record) => record.windSpeed)),
  };
}
