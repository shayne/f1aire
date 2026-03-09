import { afterEach, describe, expect, it } from 'vitest';
import type { SessionStore } from './session-store.js';
import { createOperatorApi } from './operator-api.js';
import { startOperatorApiServer } from './operator-server.js';
import { TimingService } from './timing-service.js';

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

const activeServers = new Set<
  Awaited<ReturnType<typeof startOperatorApiServer>>
>();

afterEach(async () => {
  for (const server of activeServers) {
    await server.close();
  }
  activeServers.clear();
});

async function startTestServer(
  testPoints: RawPoint[] = points,
  options: BuildStoreOptions = {},
) {
  const service = new TimingService();
  testPoints.forEach((point) => service.enqueue(point));
  const api = createOperatorApi({
    store: buildStore(testPoints, options),
    service,
  });
  const server = await startOperatorApiServer({ api });
  activeServers.add(server);
  return server;
}

describe('operator-server', () => {
  it('serves latest topic snapshots and timing endpoints', async () => {
    const server = await startTestServer();

    const latestResponse = await fetch(
      `${server.origin}/data/DriverList/latest`,
    );
    expect(latestResponse.status).toBe(200);
    await expect(latestResponse.json()).resolves.toEqual({
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

    const lapResponse = await fetch(
      `${server.origin}/data/TimingData/laps/11?driverNumber=81`,
    );
    expect(lapResponse.status).toBe(200);
    await expect(lapResponse.json()).resolves.toMatchObject({
      requestedLap: 11,
      resolvedLap: 11,
      source: 'lap',
      totalDrivers: 1,
      drivers: [
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
        },
      ],
    });

    const radioResponse = await fetch(
      `${server.origin}/data/TeamRadio/events?driverNumber=4&limit=1`,
    );
    expect(radioResponse.status).toBe(200);
    await expect(radioResponse.json()).resolves.toEqual({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      total: 1,
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

    const bestResponse = await fetch(
      `${server.origin}/data/TimingData/laps/best?includeSnapshot=true&limit=1`,
    );
    expect(bestResponse.status).toBe(200);
    await expect(bestResponse.json()).resolves.toMatchObject({
      totalDrivers: 1,
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
      ],
    });
  });

  it('serves structured session lifecycle events over HTTP', async () => {
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

    const server = await startTestServer(lifecyclePoints, {
      subscribe: {
        SessionInfo: {
          SessionStatus: 'Inactive',
          ArchiveStatus: { Status: 'Generating' },
        },
      },
    });

    const lifecycleResponse = await fetch(
      `${server.origin}/data/SessionLifecycle/events?limit=2&order=desc&includeFuture=true`,
    );
    expect(lifecycleResponse.status).toBe(200);
    await expect(lifecycleResponse.json()).resolves.toEqual({
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

  it('mirrors replay control state and structured control errors over HTTP', async () => {
    const server = await startTestServer();

    const stateResponse = await fetch(`${server.origin}/control`);
    expect(stateResponse.status).toBe(200);
    await expect(stateResponse.json()).resolves.toMatchObject({
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

    const controlResponse = await fetch(`${server.origin}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set-lap', lap: 999 }),
    });
    expect(controlResponse.status).toBe(200);
    await expect(controlResponse.json()).resolves.toMatchObject({
      cursor: { lap: 12 },
      resolved: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'lap',
      },
    });

    const stepTimeResponse = await fetch(`${server.origin}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'step-time',
        deltaMs: -600,
      }),
    });
    expect(stepTimeResponse.status).toBe(200);
    await expect(stepTimeResponse.json()).resolves.toMatchObject({
      cursor: {
        lap: 11,
        iso: '2025-01-01T00:00:11.400Z',
        latest: false,
      },
      resolved: {
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        source: 'time',
      },
    });

    const invalidResponse = await fetch(`${server.origin}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'set-time', iso: 'nope' }),
    });
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({
      errorCode: 'invalid-request',
      errorMessage: 'set-time requires a valid ISO timestamp.',
    });

    const invalidStepTimeResponse = await fetch(`${server.origin}/control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'step-time', deltaMs: 'bad' }),
    });
    expect(invalidStepTimeResponse.status).toBe(400);
    await expect(invalidStepTimeResponse.json()).resolves.toEqual({
      errorCode: 'invalid-request',
      errorMessage: 'step-time requires a finite deltaMs value.',
    });
  });
});
