import { parseLapTimeMs } from './summary.js';
import { isPlainObject } from './processors/merge.js';

export type TrackStatusLike = { Status?: unknown; Message?: unknown } | null;

export function decodeCarChannels(channels: unknown) {
  if (!channels || typeof channels !== 'object') return null;
  const data = channels as Record<string, unknown>;
  const readNum = (key: string) => {
    const value = data[key];
    return typeof value === 'number' ? value : null;
  };
  return {
    rpm: readNum('0'),
    speed: readNum('2'),
    gear: readNum('3'),
    throttle: readNum('4'),
    brake: readNum('5'),
    drs: readNum('45'),
  };
}

export function decodeSegmentStatus(status: unknown) {
  const raw = typeof status === 'number' ? status : Number(status);
  if (!Number.isFinite(raw)) {
    return {
      raw: null,
      personalBest: false,
      overallBest: false,
      pitLane: false,
      segmentComplete: false,
      chequeredFlag: false,
    };
  }
  return {
    raw,
    personalBest: (raw & 1) === 1,
    overallBest: (raw & 2) === 2,
    pitLane: (raw & 16) === 16,
    chequeredFlag: (raw & 1024) === 1024,
    segmentComplete: (raw & 2048) === 2048,
  };
}

export function extractSegmentStatuses(snapshot: unknown) {
  const sectorsRaw = (snapshot as any)?.Sectors;
  const sectorValues: Array<number[] | null> = [];
  const readSegments = (segmentsRaw: unknown) => {
    const segmentValues: number[] = [];
    if (Array.isArray(segmentsRaw)) {
      for (const segment of segmentsRaw) {
        const value = (segment as any)?.Status;
        if (typeof value === 'number') segmentValues.push(value);
      }
    } else if (isPlainObject(segmentsRaw)) {
      const keys = Object.keys(segmentsRaw).sort((a, b) => Number(a) - Number(b));
      for (const key of keys) {
        const value = (segmentsRaw as any)[key]?.Status;
        if (typeof value === 'number') segmentValues.push(value);
      }
    }
    return segmentValues.length > 0 ? segmentValues : null;
  };
  if (Array.isArray(sectorsRaw)) {
    for (const sector of sectorsRaw) {
      sectorValues.push(readSegments((sector as any)?.Segments));
    }
  } else if (isPlainObject(sectorsRaw)) {
    const keys = Object.keys(sectorsRaw).sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      sectorValues.push(readSegments((sectorsRaw as any)[key]?.Segments));
    }
  }
  if (sectorValues.length === 0) return null;
  return sectorValues;
}

export function extractSectorTimesMs(
  snapshot: unknown,
  options: { preferPrevious?: boolean } = {},
) {
  const sectorsRaw = (snapshot as any)?.Sectors;
  const values: string[] = [];
  const pick = (sector: any) => {
    const value = sector?.Value;
    const prev = sector?.PreviousValue;
    if (options.preferPrevious) {
      if (typeof prev === 'string' && prev.length > 0) return prev;
      if (typeof value === 'string' && value.length > 0) return value;
      return null;
    }
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof prev === 'string' && prev.length > 0) return prev;
    return null;
  };
  if (Array.isArray(sectorsRaw)) {
    for (const sector of sectorsRaw) {
      const value = pick(sector);
      if (value) values.push(value);
    }
  } else if (isPlainObject(sectorsRaw)) {
    const keys = Object.keys(sectorsRaw).sort((a, b) => Number(a) - Number(b));
    for (const key of keys) {
      const value = pick((sectorsRaw as any)[key]);
      if (value) values.push(value);
    }
  }
  if (values.length < 3) return null;
  const times = values.map((value) => parseLapTimeMs(value));
  if (times.some((value) => value === null)) return null;
  return times as number[];
}

export function extractLapTimeMs(
  snapshot: unknown,
  options: { preferPrevious?: boolean } = {},
) {
  const lastLap = (snapshot as any)?.LastLapTime?.Value;
  if (typeof lastLap === 'string' && lastLap.length > 0) {
    const parsed = parseLapTimeMs(lastLap);
    if (parsed !== null) return parsed;
  }
  const lapTime = (snapshot as any)?.LapTime?.Value;
  if (typeof lapTime === 'string' && lapTime.length > 0) {
    const parsed = parseLapTimeMs(lapTime);
    if (parsed !== null) return parsed;
  }
  const sectors = extractSectorTimesMs(snapshot, options);
  if (!sectors) return null;
  return sectors.reduce((acc, value) => acc + value, 0);
}

export function trackStatusIsGreen(status: unknown, message: unknown) {
  const statusValue = status === null || status === undefined ? '' : String(status);
  const messageValue = message === null || message === undefined ? '' : String(message);
  const statusLower = statusValue.toLowerCase();
  const messageLower = messageValue.toLowerCase();
  if (statusLower === '1' || statusLower === 'green') return true;
  if (messageLower.includes('allclear') || messageLower.includes('all clear')) return true;
  return false;
}

export function isPitLap(snapshot: unknown) {
  return Boolean(
    (snapshot as any)?.IsPitLap
      || (snapshot as any)?.InPit
      || (snapshot as any)?.PitOut
      || (snapshot as any)?.PitIn,
  );
}

export function isCleanLap(
  snapshot: unknown,
  track: TrackStatusLike,
  requireGreen = true,
) {
  if (!snapshot) return false;
  if (isPitLap(snapshot)) return false;
  if ((snapshot as any)?.Stopped) return false;
  if (requireGreen && track) {
    if (!trackStatusIsGreen(track.Status, track.Message)) return false;
  }
  return extractLapTimeMs(snapshot) !== null;
}

export function parseGapSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase().includes('lap')) return 0;
  const parsed = Number(text.replace('+', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIntervalSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.toLowerCase().includes('lap')) return 0;
  const parsed = Number(text.replace('+', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getOrderedLines(lines: Record<string, any>) {
  return Object.entries(lines).sort((a, b) => {
    const aLine = Number((a[1] as any)?.Line ?? (a[1] as any)?.Position ?? 999);
    const bLine = Number((b[1] as any)?.Line ?? (b[1] as any)?.Position ?? 999);
    return aLine - bLine;
  });
}

export function smartGapToLeaderSeconds(lines: Record<string, any>, driverNumber: string) {
  const ordered = getOrderedLines(lines);
  const index = ordered.findIndex(([num]) => num === driverNumber);
  if (index < 0) return null;
  const line = ordered[index]?.[1];
  if (!line) return null;

  const gapToLeaderValue = line?.GapToLeader;
  if (
    gapToLeaderValue !== null
    && gapToLeaderValue !== undefined
    && !String(gapToLeaderValue).toLowerCase().includes(' l')
  ) {
    return parseGapSeconds(gapToLeaderValue);
  }

  if (!line?.IntervalToPositionAhead?.Value) {
    return null;
  }

  let lastUnlappedIndex = -1;
  for (let i = index; i >= 0; i -= 1) {
    const candidate = ordered[i]?.[1];
    const candidateGap = parseGapSeconds(candidate?.GapToLeader);
    if (candidateGap !== null) {
      lastUnlappedIndex = i;
      break;
    }
  }
  if (lastUnlappedIndex < 0) return null;
  const lastUnlapped = ordered[lastUnlappedIndex]?.[1];
  const lastGap = parseGapSeconds(lastUnlapped?.GapToLeader);
  if (lastGap === null) return null;

  let summed = 0;
  for (let i = lastUnlappedIndex + 1; i <= index; i += 1) {
    const interval = ordered[i]?.[1]?.IntervalToPositionAhead?.Value;
    const seconds = parseIntervalSeconds(interval);
    if (seconds !== null) summed += seconds;
  }

  return lastGap + summed;
}
