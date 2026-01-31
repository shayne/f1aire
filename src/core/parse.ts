export type RawTimingDataPoint = {
  type: string;
  json: Record<string, unknown>;
  dateTime: Date;
};

export function parseOffsetMs(offset: string): number {
  const [hh, mm, rest] = offset.split(':');
  const [ss, ms] = rest.split('.');
  return (
    Number(hh) * 3600000 +
    Number(mm) * 60000 +
    Number(ss) * 1000 +
    Number(ms)
  );
}

export function parseJsonStreamLines(
  type: string,
  raw: string,
  start: Date,
): RawTimingDataPoint[] {
  const offsetRegex = /^\d{2}:\d{2}:\d{2}\.\d{3}/;
  return raw.split(/\r?\n/).reduce<RawTimingDataPoint[]>((points, line) => {
    const trimmedLine = line.trimEnd();
    if (trimmedLine.trim().length === 0) {
      return points;
    }
    if (!offsetRegex.test(trimmedLine)) {
      return points;
    }
    const offset = trimmedLine.slice(0, 12); // HH:MM:SS.mmm
    const payload = trimmedLine.slice(12);
    try {
      const offsetMs = parseOffsetMs(offset);
      points.push({
        type,
        json: JSON.parse(payload),
        dateTime: new Date(start.getTime() + offsetMs),
      });
    } catch {
      // Skip malformed lines leniently.
    }
    return points;
  }, []);
}
