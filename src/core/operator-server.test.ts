import { afterEach, describe, expect, it } from 'vitest';
import type { SessionStore } from './session-store.js';
import { createOperatorApi } from './operator-api.js';
import { startOperatorApiServer } from './operator-server.js';
import { TimingService } from './timing-service.js';

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

async function startTestServer() {
  const service = new TimingService();
  points.forEach((point) => service.enqueue(point));
  const api = createOperatorApi({ store: buildStore(points), service });
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
