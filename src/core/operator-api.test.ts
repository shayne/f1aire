import { describe, expect, it, vi } from 'vitest';
import type { SessionStore } from './session-store.js';
import { TimingService } from './timing-service.js';
import { createOperatorApi } from './operator-api.js';

type RawPoint = SessionStore['raw']['live'][number];

function buildStore(points: RawPoint[]): SessionStore {
  const byTopic = new Map<string, RawPoint[]>();
  for (const point of points) {
    const items = byTopic.get(point.type) ?? [];
    items.push(point);
    byTopic.set(point.type, items);
  }
  for (const items of byTopic.values()) {
    items.sort(
      (left, right) => left.dateTime.getTime() - right.dateTime.getTime(),
    );
  }
  return {
    raw: {
      subscribe: {},
      live: points,
      download: null,
      keyframes: null,
    },
    topic: (name) => {
      const items = byTopic.get(name) ?? [];
      return {
        latest: items.length > 0 ? items[items.length - 1]! : null,
        timeline: (from?: Date, to?: Date) =>
          items.filter(
            (point) =>
              (!from || point.dateTime >= from) &&
              (!to || point.dateTime <= to),
          ),
      };
    },
  };
}

describe('createOperatorApi', () => {
  const points: RawPoint[] = [
    {
      type: 'DriverList',
      json: {
        '4': { FullName: 'Lando Norris' },
        '81': { FullName: 'Oscar Piastri' },
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    },
    {
      type: 'DriverTracker',
      json: {
        Withheld: false,
        Lines: [
          { Position: '1', RacingNumber: '81', ShowPosition: true },
          {
            Position: '2',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '+0.9',
            DiffToLeader: '+0.9',
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:10Z'),
    },
    {
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Line: 2,
            NumberOfLaps: 11,
            BestLapTime: { Value: '1:31.500', Lap: 11 },
            LastLapTime: { Value: '1:31.500' },
          },
          '81': {
            Line: 1,
            NumberOfLaps: 11,
            BestLapTime: { Value: '1:30.900', Lap: 11 },
            LastLapTime: { Value: '1:30.900' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11Z'),
    },
    {
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Line: 1,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.100', Lap: 12 },
            LastLapTime: { Value: '1:30.100' },
          },
          '81': {
            Line: 2,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.900', Lap: 11 },
            LastLapTime: { Value: '1:31.200' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    },
  ];

  it('returns stable topic snapshots backed by processor state', () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const api = createOperatorApi({ store: buildStore(points), service });

    expect(api.getLatest('DriverList')).toEqual({
      topic: 'DriverList',
      streamName: 'DriverList',
      availability: 'all-sessions',
      semantics: 'patch',
      source: 'processor',
      dateTime: '2025-01-01T00:00:01.000Z',
      data: {
        '4': { FullName: 'Lando Norris' },
        '81': { FullName: 'Oscar Piastri' },
      },
    });

    expect(api.getLatest('DriverTracker')).toEqual({
      topic: 'DriverTracker',
      streamName: 'DriverTracker',
      availability: 'all-sessions',
      semantics: 'patch',
      source: 'processor',
      dateTime: '2025-01-01T00:00:10.000Z',
      data: {
        Withheld: false,
        Lines: {
          '0': {
            Position: '1',
            RacingNumber: '81',
            ShowPosition: true,
          },
          '1': {
            Position: '2',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '+0.9',
            DiffToLeader: '+0.9',
          },
        },
      },
    });
  });

  it('provides cursor-driven lap replay control with nearest-lap normalization', () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const onTimeCursorChange = vi.fn();
    const api = createOperatorApi({
      store: buildStore(points),
      service,
      timeCursor: { latest: true },
      onTimeCursorChange,
    });

    expect(api.getControlState()).toMatchObject({
      cursor: { latest: true },
      resolved: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'latest',
      },
      lapRange: {
        firstLap: 11,
        lastLap: 12,
        totalLaps: 2,
      },
    });

    expect(api.getTimingLap()).toMatchObject({
      requestedLap: null,
      resolvedLap: 12,
      source: 'latest',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
        },
      ],
    });

    expect(api.applyControl({ operation: 'set-lap', lap: 999 })).toEqual({
      ok: true,
      value: {
        sessionLoaded: true,
        sessionName: null,
        cursor: { lap: 12 },
        resolved: {
          lap: 12,
          dateTime: '2025-01-01T00:00:12.000Z',
          source: 'lap',
        },
        lapRange: {
          firstLap: 11,
          lastLap: 12,
          totalLaps: 2,
        },
      },
    });

    expect(onTimeCursorChange).toHaveBeenLastCalledWith({ lap: 12 });

    expect(api.applyControl({ operation: 'step-lap', delta: -1 })).toEqual({
      ok: true,
      value: {
        sessionLoaded: true,
        sessionName: null,
        cursor: { lap: 11 },
        resolved: {
          lap: 11,
          dateTime: '2025-01-01T00:00:11.000Z',
          source: 'lap',
        },
        lapRange: {
          firstLap: 11,
          lastLap: 12,
          totalLaps: 2,
        },
      },
    });

    expect(api.getTimingLap()).toMatchObject({
      requestedLap: 11,
      resolvedLap: 11,
      source: 'lap',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
        },
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
        },
      ],
    });
  });

  it('returns sorted best-lap records with JSON-safe snapshots', () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const api = createOperatorApi({ store: buildStore(points), service });

    expect(api.getBestLaps({ includeSnapshot: true })).toEqual({
      totalDrivers: 2,
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          time: '1:30.100',
          timeMs: 90100,
          lap: 12,
          snapshot: {
            Line: 1,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.100', Lap: 12 },
            LastLapTime: { Value: '1:30.100' },
            __dateTime: '2025-01-01T00:00:12.000Z',
          },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          time: '1:30.900',
          timeMs: 90900,
          lap: 11,
          snapshot: {
            Line: 1,
            NumberOfLaps: 11,
            BestLapTime: { Value: '1:30.900', Lap: 11 },
            LastLapTime: { Value: '1:30.900' },
            __dateTime: '2025-01-01T00:00:11.000Z',
          },
        },
      ],
    });
  });

  it('steps replay control by time relative to the current cursor timestamp', () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const onTimeCursorChange = vi.fn();
    const api = createOperatorApi({
      store: buildStore(points),
      service,
      timeCursor: { iso: '2025-01-01T00:00:11.700Z' },
      onTimeCursorChange,
    });

    expect(api.applyControl({ operation: 'step-time', deltaMs: 100 })).toEqual({
      ok: true,
      value: {
        sessionLoaded: true,
        sessionName: null,
        cursor: {
          lap: 12,
          iso: '2025-01-01T00:00:11.800Z',
          latest: false,
        },
        resolved: {
          lap: 12,
          dateTime: '2025-01-01T00:00:12.000Z',
          source: 'time',
        },
        lapRange: {
          firstLap: 11,
          lastLap: 12,
          totalLaps: 2,
        },
      },
    });

    expect(onTimeCursorChange).toHaveBeenLastCalledWith({
      lap: 12,
      iso: '2025-01-01T00:00:11.800Z',
      latest: false,
    });
  });

  it('returns structured errors for invalid replay control requests', () => {
    const api = createOperatorApi({
      store: buildStore([]),
      service: new TimingService(),
    });

    expect(api.applyControl({ operation: 'step-lap' })).toEqual({
      ok: false,
      error: {
        errorCode: 'no-laps',
        errorMessage: 'No lap snapshots are available for replay control.',
      },
    });
    expect(api.applyControl({ operation: 'set-time', iso: 'nope' })).toEqual({
      ok: false,
      error: {
        errorCode: 'invalid-request',
        errorMessage: 'set-time requires a valid ISO timestamp.',
      },
    });
    expect(api.applyControl({ operation: 'step-time', deltaMs: Number.NaN })).toEqual({
      ok: false,
      error: {
        errorCode: 'invalid-request',
        errorMessage: 'step-time requires a finite deltaMs value.',
      },
    });
  });
});
