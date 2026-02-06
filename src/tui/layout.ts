export type DataStatus = {
  drivers: number | null;
  laps: number | null;
  hasLastLap: boolean | null;
  hasSectors: boolean | null;
  hasStints: boolean | null;
  hasCarData: boolean | null;
  hasPosition: boolean | null;
  hasRaceControl: boolean | null;
  hasTeamRadio: boolean | null;
  hasWeather: boolean | null;
  hasPitStops: boolean | null;
};

export type RightPaneMode = 'minimal' | 'compact' | 'full';

export type SessionSummary = {
  winner?: { name: string; number: string } | null;
  fastestLap?: { name: string; number: string; time: string } | null;
  totalLaps?: number | null;
};

export type StatItem = { label: string; value: string };

export function getRightPaneMode(rows?: number): RightPaneMode {
  const normalized = typeof rows === 'number' && Number.isFinite(rows) ? rows : 40;
  if (normalized < 30) return 'minimal';
  if (normalized < 38) return 'compact';
  return 'full';
}

const yesNo = (value: boolean | null | undefined) => {
  if (value === null || value === undefined) return 'n/a';
  return value ? 'yes' : 'no';
};

const numberValue = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'n/a';
  return String(value);
};

export function getSessionItems({
  mode,
  year,
  meetingName,
  sessionName,
  sessionType,
  summary,
  asOfLabel,
}: {
  mode: RightPaneMode;
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

export function getDataItems({
  mode,
  modelId,
  dataStatus,
}: {
  mode: RightPaneMode;
  modelId: string | null;
  dataStatus: DataStatus | null;
}): StatItem[] {
  if (mode === 'minimal') return [];

  const items: StatItem[] = [
    { label: 'Model', value: modelId ?? 'default' },
    { label: 'Drivers', value: numberValue(dataStatus?.drivers) },
    { label: 'Laps seen', value: numberValue(dataStatus?.laps) },
    { label: 'Lap times', value: yesNo(dataStatus?.hasLastLap) },
    { label: 'Sector splits', value: yesNo(dataStatus?.hasSectors) },
    { label: 'Tyre stints', value: yesNo(dataStatus?.hasStints) },
    { label: 'Car telemetry', value: yesNo(dataStatus?.hasCarData) },
    { label: 'Position data', value: yesNo(dataStatus?.hasPosition) },
    { label: 'Race control', value: yesNo(dataStatus?.hasRaceControl) },
    { label: 'Pit data', value: yesNo(dataStatus?.hasPitStops) },
    { label: 'Team radio', value: yesNo(dataStatus?.hasTeamRadio) },
    { label: 'Weather', value: yesNo(dataStatus?.hasWeather) },
  ];

  if (mode === 'compact') return items.slice(0, 6);
  return items;
}

export function getActivityLimit(mode: RightPaneMode): number {
  if (mode === 'full') return 5;
  if (mode === 'compact') return 3;
  return 2;
}

const PANEL_OVERHEAD_LINES = 4;

export function fitRightPane({
  rows,
  mode,
  sessionItems,
  activityEntries,
  dataItems,
  codeLines = [],
}: {
  rows: number;
  mode: RightPaneMode;
  sessionItems: StatItem[];
  activityEntries: string[];
  dataItems: StatItem[];
  codeLines?: string[];
}): {
  sessionItems: StatItem[];
  activityEntries: string[];
  dataItems: StatItem[];
  codeLines: string[];
  showActivity: boolean;
  showData: boolean;
  showCode: boolean;
} {
  const safeRows = Number.isFinite(rows) ? Math.max(0, rows) : 40;
  const gap = safeRows < 32 ? 0 : 1;
  const sessionHeight = PANEL_OVERHEAD_LINES + sessionItems.length;
  const targetActivityLimit = Math.min(
    activityEntries.length,
    getActivityLimit(mode),
  );

  let remaining = safeRows - sessionHeight;
  let showActivity = false;
  let activityLimit = 0;
  if (remaining > 0) {
    const remainingAfterGap = remaining - gap;
    if (remainingAfterGap >= PANEL_OVERHEAD_LINES + 1) {
      showActivity = true;
      const extraCapacity = remainingAfterGap - PANEL_OVERHEAD_LINES;
      activityLimit = Math.max(0, Math.min(targetActivityLimit, extraCapacity));
      const activityHeight = PANEL_OVERHEAD_LINES + activityLimit;
      remaining = remainingAfterGap - activityHeight;
    }
  }

  let dataLimit = 0;
  let showData = false;
  if (remaining > 0) {
    const remainingAfterGap = remaining - gap;
    if (remainingAfterGap >= PANEL_OVERHEAD_LINES + 1) {
      const dataCapacity = remainingAfterGap - PANEL_OVERHEAD_LINES;
      dataLimit = Math.max(0, Math.min(dataItems.length, dataCapacity));
      showData = dataLimit > 0;
    }
  }

  let codeLimit = 0;
  let showCode = false;
  if (remaining > 0 && codeLines.length > 0) {
    const remainingAfterGap = remaining - gap;
    if (remainingAfterGap >= PANEL_OVERHEAD_LINES + 1) {
      const codeCapacity = remainingAfterGap - PANEL_OVERHEAD_LINES;
      codeLimit = Math.max(0, Math.min(codeLines.length, codeCapacity));
      showCode = codeLimit > 0;
    }
  }

  return {
    sessionItems,
    activityEntries: showActivity
      ? activityEntries.slice(-activityLimit)
      : [],
    dataItems: showData ? dataItems.slice(0, dataLimit) : [],
    codeLines: showCode ? codeLines.slice(-codeLimit) : [],
    showActivity,
    showData,
    showCode,
  };
}
