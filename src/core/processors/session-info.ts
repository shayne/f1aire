import { isPlainObject, mergeDeep } from './merge.js';
import type { Processor, RawPoint } from './types.js';

const DEFAULT_CIRCUIT_API_BASE = 'https://undercutf1.amandhoot.com';
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'f1aire/0.1.0';

export type CircuitPoint = {
  x: number;
  y: number;
};

export type CircuitCorner = {
  number: number;
  x: number;
  y: number;
};

export type SessionInfoState = Record<string, unknown> & {
  Name?: string | null;
  Type?: string | null;
  StartDate?: string | null;
  Path?: string | null;
  Meeting?: {
    Circuit?: {
      Key?: string | number | null;
      ShortName?: string | null;
    };
  } & Record<string, unknown>;
  CircuitPoints?: CircuitPoint[];
  CircuitCorners?: CircuitCorner[];
  CircuitRotation?: number;
};

type CircuitData = {
  points: CircuitPoint[];
  corners: CircuitCorner[];
  rotation: number;
};

function readValue(
  record: Record<string, unknown>,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return undefined;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toFiniteInteger(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function toCircuitAxis(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toFiniteInteger(item))
    .filter((item): item is number => item !== null)
    .map((item) => item);
}

function parseCircuitData(value: unknown): CircuitData | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const x = toCircuitAxis(readValue(value, 'X', 'x'));
  const y = toCircuitAxis(readValue(value, 'Y', 'y'));
  const pointCount = Math.min(x.length, y.length);
  const points: CircuitPoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    points.push({ x: x[index], y: y[index] });
  }

  const cornersRaw = readValue(value, 'Corners', 'corners');
  const corners = Array.isArray(cornersRaw)
    ? cornersRaw
        .map((item) => {
          if (!isPlainObject(item)) {
            return null;
          }
          const trackPosition = readValue(
            item,
            'TrackPosition',
            'trackPosition',
          );
          if (!isPlainObject(trackPosition)) {
            return null;
          }
          const number = toFiniteInteger(readValue(item, 'Number', 'number'));
          const xPos = toFiniteNumber(readValue(trackPosition, 'X', 'x'));
          const yPos = toFiniteNumber(readValue(trackPosition, 'Y', 'y'));
          if (number === null || xPos === null || yPos === null) {
            return null;
          }
          return { number, x: xPos, y: yPos };
        })
        .filter((item): item is CircuitCorner => item !== null)
    : [];

  const rotation =
    toFiniteInteger(readValue(value, 'Rotation', 'rotation')) ?? 0;

  if (points.length === 0 && corners.length === 0 && rotation === 0) {
    return null;
  }

  return { points, corners, rotation };
}

function getCircuitKey(state: SessionInfoState | null): number | null {
  return toFiniteInteger(state?.Meeting?.Circuit?.Key);
}

function getSessionSeasonYear(state: SessionInfoState | null): number {
  const startDate =
    typeof state?.StartDate === 'string' ? state.StartDate : null;
  if (startDate) {
    const parsed = new Date(startDate);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.getUTCFullYear();
    }
  }

  const path = typeof state?.Path === 'string' ? state.Path.trim() : '';
  const pathYear = path.match(/^(\d{4})(?:\/|$)/)?.[1];
  if (pathYear) {
    return Number(pathYear);
  }

  return new Date().getUTCFullYear();
}

function hasCircuitGeometry(state: SessionInfoState | null): boolean {
  if (!state) {
    return false;
  }
  return (
    (Array.isArray(state.CircuitPoints) && state.CircuitPoints.length > 0) ||
    (Array.isArray(state.CircuitCorners) && state.CircuitCorners.length > 0)
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export class SessionInfoProcessor implements Processor<SessionInfoState> {
  latest: SessionInfoState | null = null;
  state: SessionInfoState | null = null;

  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private pendingLoadKey: string | null = null;
  private loadedKey: string | null = null;
  private circuitLoadPromise: Promise<void> | null = null;

  constructor(
    options: {
      apiBaseUrl?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_CIRCUIT_API_BASE).replace(
      /\/+$/,
      '',
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  }

  process(point: RawPoint) {
    if (point.type !== 'SessionInfo') {
      return;
    }

    const patch = (point.json ?? {}) as SessionInfoState;
    if (!this.state) {
      this.state = structuredClone(patch) as SessionInfoState;
    } else if (isPlainObject(patch)) {
      mergeDeep(this.state as Record<string, unknown>, patch);
    } else {
      this.state = structuredClone(patch) as SessionInfoState;
    }
    this.latest = this.state;

    void this.ensureCircuitData();
  }

  async waitForCircuitData() {
    await this.circuitLoadPromise;
  }

  private async ensureCircuitData() {
    const circuitKey = getCircuitKey(this.state);
    if (circuitKey === null) {
      return;
    }

    const seasonYear = getSessionSeasonYear(this.state);
    const loadKey = `${circuitKey}:${seasonYear}`;

    if (hasCircuitGeometry(this.state)) {
      this.loadedKey = loadKey;
      return;
    }
    if (this.loadedKey === loadKey || this.pendingLoadKey === loadKey) {
      return;
    }

    this.pendingLoadKey = loadKey;
    this.circuitLoadPromise = this.loadCircuitData(circuitKey, seasonYear)
      .then((data) => {
        if (!data || !this.state) {
          return;
        }
        if (getCircuitKey(this.state) !== circuitKey) {
          return;
        }
        this.state.CircuitPoints = data.points;
        this.state.CircuitCorners = data.corners;
        this.state.CircuitRotation = data.rotation;
        this.latest = this.state;
        this.loadedKey = loadKey;
      })
      .catch(() => {})
      .finally(() => {
        if (this.pendingLoadKey === loadKey) {
          this.pendingLoadKey = null;
        }
        this.circuitLoadPromise = null;
      });

    await this.circuitLoadPromise;
  }

  private async loadCircuitData(
    circuitKey: number,
    seasonYear: number,
  ): Promise<CircuitData | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.apiBaseUrl}/api/v1/circuits/${circuitKey}/${seasonYear}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return null;
      }

      const payload: unknown = await response.json();
      return parseCircuitData(payload);
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
