export type TimeCursor = { lap?: number; iso?: string; latest?: boolean };

export type ResolvedCursor = {
  lap: number | null;
  dateTime: Date | null;
  source: 'latest' | 'lap' | 'time' | 'none';
};

export function resolveTimeCursor({
  lapTimes,
  lapNumbers,
  cursor,
}: {
  lapTimes: Map<number, Date | null>;
  lapNumbers: number[];
  cursor?: TimeCursor | null;
}): ResolvedCursor {
  const sorted = [...lapNumbers].sort((a, b) => a - b);
  if (!sorted.length) return { lap: null, dateTime: null, source: 'none' };

  const pickLap = (lap: number) => {
    const nearest = sorted.reduce((best, current) => {
      const bestDiff = Math.abs(best - lap);
      const currentDiff = Math.abs(current - lap);
      if (currentDiff < bestDiff) return current;
      if (currentDiff === bestDiff) return Math.min(best, current);
      return best;
    }, sorted[0]);
    return nearest;
  };

  if (!cursor || cursor.latest) {
    const lap = sorted[sorted.length - 1];
    return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
  }

  if (typeof cursor.lap === 'number') {
    const lap = pickLap(cursor.lap);
    return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'lap' };
  }

  if (cursor.iso) {
    const target = new Date(cursor.iso);
    if (!Number.isFinite(target.getTime())) {
      const lap = sorted[sorted.length - 1];
      return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
    }
    let bestLap = sorted[0];
    let bestDiff = Infinity;
    for (const lap of sorted) {
      const dt = lapTimes.get(lap);
      if (!dt) continue;
      const diff = Math.abs(dt.getTime() - target.getTime());
      if (diff < bestDiff) {
        bestDiff = diff;
        bestLap = lap;
      }
    }
    return { lap: bestLap, dateTime: lapTimes.get(bestLap) ?? null, source: 'time' };
  }

  const lap = sorted[sorted.length - 1];
  return { lap, dateTime: lapTimes.get(lap) ?? null, source: 'latest' };
}
