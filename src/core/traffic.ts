export type TrafficLabel = 'traffic' | 'clean' | 'neutral' | 'unknown';

export type TrafficThresholds = {
  trafficAheadBase: number;
  trafficAheadFactor: number;
  trafficBehindBase: number;
  trafficBehindFactor: number;
  cleanAheadBase: number;
  cleanAheadFactor: number;
  cleanBehindBase: number;
  cleanBehindFactor: number;
};

export const DEFAULT_TRAFFIC_THRESHOLDS: TrafficThresholds = {
  trafficAheadBase: 1.0,
  trafficAheadFactor: 0.012,
  trafficBehindBase: 0.8,
  trafficBehindFactor: 0.010,
  cleanAheadBase: 1.7,
  cleanAheadFactor: 0.018,
  cleanBehindBase: 1.3,
  cleanBehindFactor: 0.014,
};

export function classifyTraffic({
  gapAheadSec,
  gapBehindSec,
  lapTimeMs,
  isGreen,
  thresholds = DEFAULT_TRAFFIC_THRESHOLDS,
}: {
  gapAheadSec: number | null;
  gapBehindSec: number | null;
  lapTimeMs: number | null;
  isGreen: boolean | null;
  thresholds?: TrafficThresholds;
}): TrafficLabel {
  if (!Number.isFinite(lapTimeMs ?? NaN)) return 'unknown';
  if (gapAheadSec == null || gapBehindSec == null) return 'unknown';
  if (!Number.isFinite(gapAheadSec ?? NaN) || !Number.isFinite(gapBehindSec ?? NaN)) {
    return 'unknown';
  }
  const lapTimeSec = (lapTimeMs ?? 0) / 1000;
  const trafficAhead = Math.max(
    thresholds.trafficAheadBase,
    thresholds.trafficAheadFactor * lapTimeSec,
  );
  const trafficBehind = Math.max(
    thresholds.trafficBehindBase,
    thresholds.trafficBehindFactor * lapTimeSec,
  );
  const cleanAhead = Math.max(
    thresholds.cleanAheadBase,
    thresholds.cleanAheadFactor * lapTimeSec,
  );
  const cleanBehind = Math.max(
    thresholds.cleanBehindBase,
    thresholds.cleanBehindFactor * lapTimeSec,
  );

  if (gapAheadSec <= trafficAhead || gapBehindSec <= trafficBehind) return 'traffic';
  if (isGreen && gapAheadSec >= cleanAhead && gapBehindSec >= cleanBehind) return 'clean';
  return 'neutral';
}
