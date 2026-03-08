import { isPlainObject, mergeDeep } from './merge.js';
import type { Processor, RawPoint } from './types.js';

export type ExtrapolatedClockState = {
  Utc?: string;
  Remaining?: string;
  Extrapolating?: boolean;
} & Record<string, unknown>;

export type ProjectedSessionClock = {
  state: ExtrapolatedClockState | null;
  sourceTime: Date | null;
  referenceTime: Date | null;
  remainingMs: number | null;
  remainingSeconds: number | null;
  extrapolating: boolean;
  expired: boolean | null;
};

export type ExtrapolatedClockHistoryEntry = {
  at: Date;
  sourceTime: Date | null;
  state: ExtrapolatedClockState | null;
};

function emptyProjection(): ProjectedSessionClock {
  return {
    state: null,
    sourceTime: null,
    referenceTime: null,
    remainingMs: null,
    remainingSeconds: null,
    extrapolating: false,
    expired: null,
  };
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parseExtrapolatedClockRemainingMs(
  value: unknown,
): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const sign = trimmed.startsWith('-') ? -1 : 1;
  const normalized = sign === -1 ? trimmed.slice(1) : trimmed;
  const parts = normalized.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [hoursText, minutesText, secondsText] = parts;
  const [secondsWholeText, millisText = '0'] = secondsText.split('.');

  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsWholeText);
  const millis = Number(millisText.padEnd(3, '0').slice(0, 3));

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(millis)
  ) {
    return null;
  }

  return (
    sign * (hours * 3_600_000 + minutes * 60_000 + seconds * 1_000 + millis)
  );
}

export function projectExtrapolatedClockState(
  value: unknown,
  referenceTime?: Date | null,
  fallbackSourceTime?: Date | null,
): ProjectedSessionClock {
  if (!isPlainObject(value)) {
    return emptyProjection();
  }

  const state = structuredClone(value) as ExtrapolatedClockState;
  const sourceTime = parseIsoDate(state.Utc) ?? fallbackSourceTime ?? null;
  const effectiveReferenceTime =
    referenceTime && Number.isFinite(referenceTime.getTime())
      ? referenceTime
      : sourceTime;
  const baseRemainingMs = parseExtrapolatedClockRemainingMs(state.Remaining);
  const extrapolating = Boolean(state.Extrapolating);

  let remainingMs = baseRemainingMs;
  if (
    remainingMs !== null &&
    extrapolating &&
    sourceTime &&
    effectiveReferenceTime
  ) {
    remainingMs -= effectiveReferenceTime.getTime() - sourceTime.getTime();
  }

  return {
    state,
    sourceTime,
    referenceTime: effectiveReferenceTime ?? null,
    remainingMs,
    remainingSeconds: remainingMs === null ? null : remainingMs / 1_000,
    extrapolating,
    expired: remainingMs === null ? null : remainingMs <= 0,
  };
}

export class ExtrapolatedClockProcessor implements Processor<ExtrapolatedClockState> {
  latest: ExtrapolatedClockState | null = null;
  state: ExtrapolatedClockState | null = null;
  history: ExtrapolatedClockHistoryEntry[] = [];

  process(point: RawPoint) {
    if (point.type !== 'ExtrapolatedClock') {
      return;
    }

    const patch = point.json;
    if (!this.state) {
      this.state = isPlainObject(patch)
        ? (structuredClone(patch) as ExtrapolatedClockState)
        : null;
    } else if (isPlainObject(patch)) {
      mergeDeep(this.state, patch);
    } else {
      this.state = null;
    }

    this.latest = this.state;

    this.history.push({
      at: point.dateTime,
      sourceTime: parseIsoDate(this.state?.Utc) ?? point.dateTime,
      state: this.state ? structuredClone(this.state) : null,
    });
  }

  getAt(referenceTime?: Date | null): ExtrapolatedClockState | null {
    return this.getEntryAt(referenceTime)?.state ?? null;
  }

  getRemainingAt(referenceTime?: Date | null): ProjectedSessionClock {
    const entry = this.getEntryAt(referenceTime);
    if (!entry) {
      return projectExtrapolatedClockState(this.state, referenceTime);
    }
    return projectExtrapolatedClockState(
      entry.state,
      referenceTime,
      entry.sourceTime,
    );
  }

  private getEntryAt(
    referenceTime?: Date | null,
  ): ExtrapolatedClockHistoryEntry | null {
    if (!this.history.length) {
      return null;
    }

    if (!referenceTime || !Number.isFinite(referenceTime.getTime())) {
      return this.history[this.history.length - 1] ?? null;
    }

    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      const entry = this.history[index];
      if (entry.at.getTime() <= referenceTime.getTime()) {
        return entry;
      }
    }

    return this.history[0] ?? null;
  }
}
