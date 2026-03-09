import { describe, expect, it, vi } from 'vitest';
import type { SessionStore } from './session-store.js';
import { TimingService } from './timing-service.js';
import { createOperatorApi } from './operator-api.js';

type RawPoint = SessionStore['raw']['live'][number];

type BuildStoreOptions = {
  subscribe?: Record<string, unknown>;
};

function buildStore(
  points: RawPoint[],
  options: BuildStoreOptions = {},
): SessionStore {
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
      subscribe: options.subscribe ?? {},
      live: points,
      download: {
        prefix:
          'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      },
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
      type: 'TeamRadio',
      json: {
        Captures: {
          '0': {
            Utc: '2025-01-01T00:00:10.500Z',
            RacingNumber: '81',
            Path: 'TeamRadio/OSCPIA01_81_20250101_000010.mp3',
          },
          '1': {
            Utc: '2025-01-01T00:00:11.700Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20250101_000011.mp3',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11.700Z'),
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

  it('returns deterministic team radio events with resolved clip URLs and lap context', () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const api = createOperatorApi({ store: buildStore(points), service });

    expect(api.getTeamRadioEvents({ limit: 1 })).toEqual({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      total: 2,
      returned: 1,
      captures: [
        {
          captureId: '1',
          utc: '2025-01-01T00:00:11.700Z',
          driverNumber: '4',
          driverName: 'Lando Norris',
          path: 'TeamRadio/LANNOR01_4_20250101_000011.mp3',
          assetUrl:
            'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/TeamRadio/LANNOR01_4_20250101_000011.mp3',
          downloadedFilePath: null,
          hasTranscription: false,
          context: {
            captureTime: '2025-01-01T00:00:11.700Z',
            matchedTimingTime: '2025-01-01T00:00:11.000Z',
            matchMode: 'at-or-before',
            lap: 11,
            position: 2,
            gapToLeaderSec: null,
            intervalToAheadSec: null,
            traffic: 'unknown',
            trackStatus: null,
            flags: {
              pit: false,
              pitIn: false,
              pitOut: false,
              inPit: false,
            },
            stint: null,
          },
        },
      ],
    });
  });

  it('returns cursor-aware session lifecycle snapshots and event timelines', () => {
    const lifecyclePoints: RawPoint[] = [
      ...points,
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '0': {
              Utc: '2025-01-01T00:00:02.000Z',
              SessionStatus: 'Started',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:02Z'),
      },
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '1': {
              Utc: '2025-01-01T00:00:03.000Z',
              TrackStatus: 'Yellow',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:03Z'),
      },
      {
        type: 'SessionStatus',
        json: {
          Utc: '2025-01-01T00:00:04.000Z',
          Status: 'Started',
        },
        dateTime: new Date('2025-01-01T00:00:04Z'),
      },
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '2': {
              Utc: '2025-01-01T00:00:13.000Z',
              SessionStatus: 'Finished',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:13Z'),
      },
      {
        type: 'ArchiveStatus',
        json: {
          Status: 'Complete',
        },
        dateTime: new Date('2025-01-01T00:00:14Z'),
      },
    ];
    const service = new TimingService();
    lifecyclePoints.forEach((point) => service.enqueue(point));
    const api = createOperatorApi({
      store: buildStore(lifecyclePoints, {
        subscribe: {
          SessionInfo: {
            SessionStatus: 'Inactive',
            ArchiveStatus: { Status: 'Generating' },
          },
        },
      }),
      service,
    });

    expect(api.getSessionLifecycle()).toEqual({
      asOf: {
        source: 'latest',
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        includeFuture: false,
      },
      sessionStatus: {
        status: 'Started',
        utc: '2025-01-01T00:00:04.000Z',
        source: 'SessionStatus',
      },
      trackStatus: {
        status: 'Yellow',
        utc: '2025-01-01T00:00:03.000Z',
        source: 'SessionData',
      },
      archiveStatus: {
        status: 'Generating',
        source: 'SessionInfo',
        raw: { Status: 'Generating' },
      },
      total: 3,
      returned: 3,
      order: 'asc',
      events: [
        {
          eventId: '0',
          utc: '2025-01-01T00:00:02.000Z',
          sessionStatus: 'Started',
          trackStatus: null,
          source: 'SessionData',
        },
        {
          eventId: '1',
          utc: '2025-01-01T00:00:03.000Z',
          sessionStatus: null,
          trackStatus: 'Yellow',
          source: 'SessionData',
        },
        {
          eventId: 'latest',
          utc: '2025-01-01T00:00:04.000Z',
          sessionStatus: 'Started',
          trackStatus: null,
          source: 'SessionStatus',
        },
      ],
    });

    expect(
      api.getSessionLifecycle({
        includeFuture: true,
        order: 'desc',
        limit: 2,
      }),
    ).toEqual({
      asOf: {
        source: 'latest',
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        includeFuture: true,
      },
      sessionStatus: {
        status: 'Finished',
        utc: '2025-01-01T00:00:13.000Z',
        source: 'SessionData',
      },
      trackStatus: {
        status: 'Yellow',
        utc: '2025-01-01T00:00:03.000Z',
        source: 'SessionData',
      },
      archiveStatus: {
        status: 'Complete',
        source: 'ArchiveStatus',
        raw: { Status: 'Complete' },
      },
      total: 4,
      returned: 2,
      order: 'desc',
      events: [
        {
          eventId: '2',
          utc: '2025-01-01T00:00:13.000Z',
          sessionStatus: 'Finished',
          trackStatus: null,
          source: 'SessionData',
        },
        {
          eventId: 'latest',
          utc: '2025-01-01T00:00:04.000Z',
          sessionStatus: 'Started',
          trackStatus: null,
          source: 'SessionStatus',
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
    expect(
      api.applyControl({ operation: 'step-time', deltaMs: Number.NaN }),
    ).toEqual({
      ok: false,
      error: {
        errorCode: 'invalid-request',
        errorMessage: 'step-time requires a finite deltaMs value.',
      },
    });
  });
});
