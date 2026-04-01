export type SessionSummary = {
  winner?: { name: string; number: string } | null;
  fastestLap?: { name: string; number: string; time: string } | null;
  totalLaps?: number | null;
};

export type StatItem = { label: string; value: string };

export function getSessionItems({
  mode,
  year,
  meetingName,
  sessionName,
  sessionType,
  summary,
  asOfLabel,
}: {
  mode: 'minimal' | 'compact' | 'full';
  year: number;
  meetingName: string;
  sessionName: string;
  sessionType: string;
  summary: SessionSummary | null;
  asOfLabel?: string | null;
}): StatItem[] {
  const items: StatItem[] = [
    { label: 'Year', value: String(year) },
    { label: 'Event', value: meetingName },
    { label: 'Session', value: `${sessionName} (${sessionType})` },
  ];

  if (asOfLabel) items.push({ label: 'As of', value: asOfLabel });
  if (mode === 'minimal' || !summary) return items;

  items.push({
    label: 'Winner',
    value: summary.winner
      ? `${summary.winner.name} (#${summary.winner.number})`
      : 'n/a',
  });
  items.push({
    label: 'Fastest lap',
    value: summary.fastestLap
      ? `${summary.fastestLap.name} (#${summary.fastestLap.number}) ${summary.fastestLap.time}`
      : 'n/a',
  });

  if (mode === 'full') {
    items.push({
      label: 'Total laps',
      value:
        summary.totalLaps !== null && summary.totalLaps !== undefined
          ? String(summary.totalLaps)
          : 'n/a',
    });
  }

  return items;
}
