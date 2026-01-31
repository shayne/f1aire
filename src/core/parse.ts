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
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const offset = line.slice(0, 12); // HH:MM:SS.mmm
      const payload = line.slice(12);
      const offsetMs = parseOffsetMs(offset);
      return {
        type,
        json: JSON.parse(payload),
        dateTime: new Date(start.getTime() + offsetMs),
      };
    });
}
