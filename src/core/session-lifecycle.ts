import { isPlainObject, mergeDeep } from './processors/merge.js';

export type SessionLifecycleEventSource =
  | 'SessionData'
  | 'SessionStatus'
  | 'SessionInfo';

export type ArchiveStatusSource = 'ArchiveStatus' | 'SessionInfo';

export type SessionLifecycleEvent = {
  eventId: string;
  utc: string | null;
  sessionStatus: string | null;
  trackStatus: string | null;
  source: SessionLifecycleEventSource;
  raw: Record<string, unknown>;
};

export type SessionLifecycleStatus = {
  status: string;
  utc: string | null;
  source: SessionLifecycleEventSource;
};

export type SessionArchiveStatus = {
  status: string;
  source: ArchiveStatusSource;
  raw: Record<string, unknown>;
};

export type SessionLifecycleSnapshot = {
  sessionStatus: SessionLifecycleStatus | null;
  trackStatus: SessionLifecycleStatus | null;
  archiveStatus: SessionArchiveStatus | null;
  events: SessionLifecycleEvent[];
};

type SessionDataState = Record<string, unknown> & {
  StatusSeries?: Record<string, unknown> | unknown[];
};

function arrayToIndexedObject(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  const out: Record<string, unknown> = {};
  value.forEach((entry, index) => {
    out[String(index)] = entry;
  });
  return out;
}

function normalizeSessionDataPatch(value: unknown): SessionDataState | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const next = cloneRecord(value as Record<string, unknown>) as SessionDataState;
  next.StatusSeries = arrayToIndexedObject(next.StatusSeries) as
    | Record<string, unknown>
    | unknown[]
    | undefined;
  if (Array.isArray(next.Series)) {
    next.Series = arrayToIndexedObject(next.Series);
  }
  return next;
}

function cloneRecord<T extends Record<string, unknown>>(value: T): T {
  return structuredClone(value) as T;
}

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

function toOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function parseUtcMs(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSourcePriority(source: SessionLifecycleEventSource) {
  switch (source) {
    case 'SessionStatus':
      return 3;
    case 'SessionData':
      return 2;
    case 'SessionInfo':
      return 1;
  }
}

function buildLifecycleEvent(opts: {
  eventId: string;
  raw: unknown;
  source: SessionLifecycleEventSource;
}): SessionLifecycleEvent | null {
  const root = isPlainObject(opts.raw)
    ? opts.raw
    : typeof opts.raw === 'string'
      ? { Status: opts.raw }
      : null;

  if (!root) {
    return null;
  }

  const sessionStatus =
    toOptionalString(root.SessionStatus) ?? toOptionalString(root.Status);
  const trackStatus = toOptionalString(root.TrackStatus);

  if (!sessionStatus && !trackStatus) {
    return null;
  }

  return {
    eventId: opts.eventId,
    utc: toOptionalString(root.Utc) ?? toOptionalString(root.Timestamp),
    sessionStatus,
    trackStatus,
    source: opts.source,
    raw: cloneRecord(root),
  };
}

function getLifecycleEventKey(event: SessionLifecycleEvent) {
  return [
    event.utc ?? '',
    event.sessionStatus ?? '',
    event.trackStatus ?? '',
  ].join('|');
}

function compareLifecycleEvents(
  left: SessionLifecycleEvent,
  right: SessionLifecycleEvent,
) {
  const leftMs = parseUtcMs(left.utc);
  const rightMs = parseUtcMs(right.utc);

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

  return compareMaybeNumericStrings(left.eventId, right.eventId);
}

function getLatestLifecycleStatus(
  events: SessionLifecycleEvent[],
  field: 'sessionStatus' | 'trackStatus',
): SessionLifecycleStatus | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const status = event?.[field];
    if (!status) {
      continue;
    }
    return {
      status,
      utc: event.utc,
      source: event.source,
    };
  }
  return null;
}

function buildArchiveStatus(
  value: unknown,
  source: ArchiveStatusSource,
): SessionArchiveStatus | null {
  const root = isPlainObject(value)
    ? value
    : typeof value === 'string'
      ? { Status: value }
      : null;

  if (!root) {
    return null;
  }

  const status = toOptionalString(root.Status) ?? toOptionalString(root.ArchiveStatus);
  if (!status) {
    return null;
  }

  return {
    status,
    source,
    raw: cloneRecord(root),
  };
}

export function mergeSessionDataState(
  current: SessionDataState | null,
  patch: unknown,
): SessionDataState | null {
  const normalizedPatch = normalizeSessionDataPatch(patch);
  if (!normalizedPatch) {
    return current ? cloneRecord(current) : null;
  }

  const next = current ? cloneRecord(current) : {};
  mergeDeep(next, normalizedPatch);
  return next as SessionDataState;
}

export function buildSessionDataState(opts: {
  baseState?: unknown;
  timeline?: Array<{ json: unknown }>;
}): SessionDataState | null {
  let state = mergeSessionDataState(null, opts.baseState ?? null);
  for (const point of opts.timeline ?? []) {
    state = mergeSessionDataState(state, point?.json ?? null);
  }
  return state;
}

export function getSessionLifecycleEvents(opts: {
  sessionDataState?: unknown;
  sessionStatusState?: unknown;
  sessionInfoState?: unknown;
}): SessionLifecycleEvent[] {
  const events = new Map<string, SessionLifecycleEvent>();

  const sessionData = isPlainObject(opts.sessionDataState)
    ? (opts.sessionDataState as SessionDataState)
    : null;

  for (const [eventId, raw] of toOrderedEntries(sessionData?.StatusSeries)) {
    const event = buildLifecycleEvent({
      eventId,
      raw,
      source: 'SessionData',
    });
    if (!event) {
      continue;
    }

    const key = getLifecycleEventKey(event);
    const existing = events.get(key);
    if (!existing || getSourcePriority(event.source) > getSourcePriority(existing.source)) {
      events.set(key, event);
    }
  }

  const standalone = buildLifecycleEvent({
    eventId: 'latest',
    raw: opts.sessionStatusState,
    source: 'SessionStatus',
  });
  if (standalone) {
    const key = getLifecycleEventKey(standalone);
    const existing = events.get(key);
    if (!existing || getSourcePriority(standalone.source) > getSourcePriority(existing.source)) {
      events.set(key, standalone);
    }
  }

  const ordered = Array.from(events.values()).sort(compareLifecycleEvents);
  if (ordered.length > 0) {
    return ordered;
  }

  const sessionInfo = isPlainObject(opts.sessionInfoState)
    ? opts.sessionInfoState
    : null;
  const fallback = buildLifecycleEvent({
    eventId: 'session-info',
    raw: sessionInfo?.SessionStatus,
    source: 'SessionInfo',
  });
  return fallback ? [fallback] : [];
}

export function getArchiveStatus(opts: {
  archiveStatusState?: unknown;
  sessionInfoState?: unknown;
}): SessionArchiveStatus | null {
  const direct = buildArchiveStatus(opts.archiveStatusState, 'ArchiveStatus');
  if (direct) {
    return direct;
  }

  const sessionInfo = isPlainObject(opts.sessionInfoState)
    ? opts.sessionInfoState
    : null;
  return buildArchiveStatus(sessionInfo?.ArchiveStatus, 'SessionInfo');
}

export function buildSessionLifecycleSnapshot(opts: {
  sessionDataState?: unknown;
  sessionStatusState?: unknown;
  archiveStatusState?: unknown;
  sessionInfoState?: unknown;
}): SessionLifecycleSnapshot {
  const events = getSessionLifecycleEvents(opts);
  return {
    sessionStatus: getLatestLifecycleStatus(events, 'sessionStatus'),
    trackStatus: getLatestLifecycleStatus(events, 'trackStatus'),
    archiveStatus: getArchiveStatus(opts),
    events,
  };
}
