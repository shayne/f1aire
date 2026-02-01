import { inflateBase64Sync } from '../decompress.js';
import { isPlainObject } from './merge.js';
import type { RawPoint } from './types.js';

function arrayToIndexedObject(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  value.forEach((item, index) => {
    out[String(index)] = item as unknown;
  });
  return out;
}

function normalizeTimingData(obj: Record<string, unknown>) {
  const lines = obj.Lines;
  if (!isPlainObject(lines)) return;
  for (const line of Object.values(lines)) {
    if (!isPlainObject(line)) continue;
    if (Array.isArray((line as Record<string, unknown>).Sectors)) {
      (line as Record<string, unknown>).Sectors = arrayToIndexedObject(
        (line as Record<string, unknown>).Sectors,
      );
    }
    const sectors = (line as Record<string, unknown>).Sectors;
    if (!isPlainObject(sectors)) continue;
    for (const sector of Object.values(sectors)) {
      if (!isPlainObject(sector)) continue;
      if (Array.isArray((sector as Record<string, unknown>).Segments)) {
        (sector as Record<string, unknown>).Segments = arrayToIndexedObject(
          (sector as Record<string, unknown>).Segments,
        );
      }
    }
  }
}

function normalizeTimingAppData(obj: Record<string, unknown>) {
  const lines = obj.Lines;
  if (!isPlainObject(lines)) return;
  for (const line of Object.values(lines)) {
    if (!isPlainObject(line)) continue;
    if (Array.isArray((line as Record<string, unknown>).Stints)) {
      (line as Record<string, unknown>).Stints = arrayToIndexedObject(
        (line as Record<string, unknown>).Stints,
      );
    }
  }
}

function normalizePitStopSeries(obj: Record<string, unknown>) {
  const pitTimes = obj.PitTimes;
  if (!isPlainObject(pitTimes)) return;
  for (const [driver, value] of Object.entries(pitTimes)) {
    (pitTimes as Record<string, unknown>)[driver] = arrayToIndexedObject(value);
  }
}

export function normalizePoint(point: RawPoint): RawPoint {
  let { type } = point;
  let json: unknown = point.json;

  if (type.endsWith('.z') && typeof json === 'string') {
    try {
      const inflated = inflateBase64Sync(json);
      json = JSON.parse(inflated) as unknown;
      type = type.slice(0, -2);
    } catch {
      return { ...point, type: type.slice(0, -2), json: null };
    }
  }

  if (json && typeof json === 'object') {
    json = structuredClone(json);
    const obj = json as Record<string, unknown>;
    if ('_kf' in obj) {
      delete obj._kf;
    }
    if (type === 'RaceControlMessages' && Array.isArray(obj.Messages)) {
      obj.Messages = arrayToIndexedObject(obj.Messages);
    }
    if (type === 'TimingData') {
      normalizeTimingData(obj);
    }
    if (type === 'TimingAppData') {
      normalizeTimingAppData(obj);
    }
    if (type === 'TeamRadio' && Array.isArray(obj.Captures)) {
      obj.Captures = arrayToIndexedObject(obj.Captures);
    }
    if (type === 'PitStopSeries') {
      normalizePitStopSeries(obj);
    }
    if (type === 'PitLaneTimeCollection' && isPlainObject(obj.PitTimes)) {
      delete (obj.PitTimes as Record<string, unknown>)._deleted;
    }
  }

  return { ...point, type, json };
}
