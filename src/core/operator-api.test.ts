import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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

  const positionPoints: RawPoint[] = [
    ...points,
    {
      type: 'Position',
      json: {
        Position: [
          {
            Timestamp: '2025-01-01T00:00:11.500Z',
            Entries: {
              '4': { Status: 'OnTrack', X: '10', Y: '20', Z: '1' },
              '81': { Status: 'OffTrack', X: '30', Y: '40', Z: '2' },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:11.500Z'),
    },
    {
      type: 'CarData',
      json: {
        Entries: [
          {
            Utc: '2025-01-01T00:00:11.500Z',
            Cars: {
              '4': { Channels: { '2': '301', '3': '8' } },
              '81': { Channels: { '2': '299', '3': '7' } },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:11.500Z'),
    },
    {
      type: 'Position',
      json: {
        Position: [
          {
            Timestamp: '2025-01-01T00:00:12.500Z',
            Entries: {
              '4': { Status: 'OffTrack', X: '11', Y: '21', Z: '1' },
              '81': { Status: 'OnTrack', X: '31', Y: '41', Z: '2' },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.500Z'),
    },
    {
      type: 'CarData',
      json: {
        Entries: [
          {
            Utc: '2025-01-01T00:00:12.500Z',
            Cars: {
              '4': { Channels: { '2': '305', '3': '8' } },
              '81': { Channels: { '2': '300', '3': '7' } },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.500Z'),
    },
  ];

  const exactTimePositionPoints: RawPoint[] = [
    {
      type: 'DriverList',
      json: {
        '4': { FullName: 'Lando Norris' },
        '81': { FullName: 'Oscar Piastri' },
      },
      dateTime: new Date('2025-01-01T00:00:01.000Z'),
    },
    {
      type: 'TimingData',
      json: {
        Lines: {
          '4': { Line: 2, NumberOfLaps: 12 },
          '81': { Line: 1, NumberOfLaps: 12 },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12.000Z'),
    },
    {
      type: 'TimingDataF1',
      json: {
        Lines: {
          '4': { Line: 1 },
          '81': { Line: 2 },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12.250Z'),
    },
    {
      type: 'Position',
      json: {
        Position: [
          {
            Timestamp: '2025-01-01T00:00:12.260Z',
            Entries: {
              '4': { Status: 'OnTrack', X: 10, Y: 20, Z: 1 },
              '81': { Status: 'OnTrack', X: 30, Y: 40, Z: 2 },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.260Z'),
    },
    {
      type: 'CarData',
      json: {
        Entries: [
          {
            Utc: '2025-01-01T00:00:12.270Z',
            Cars: {
              '4': { Channels: { '2': '302', '3': '8' } },
              '81': { Channels: { '2': '298', '3': '7' } },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.270Z'),
    },
    {
      type: 'TimingData',
      json: {
        Lines: {
          '4': { Line: 2 },
          '81': { Line: 1 },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12.900Z'),
    },
    {
      type: 'Position',
      json: {
        Position: [
          {
            Timestamp: '2025-01-01T00:00:12.950Z',
            Entries: {
              '4': { Status: 'OnTrack', X: 11, Y: 21, Z: 1 },
              '81': { Status: 'OnTrack', X: 31, Y: 41, Z: 2 },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.950Z'),
    },
    {
      type: 'CarData',
      json: {
        Entries: [
          {
            Utc: '2025-01-01T00:00:12.960Z',
            Cars: {
              '4': { Channels: { '2': '290', '3': '7' } },
              '81': { Channels: { '2': '305', '3': '8' } },
            },
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:12.960Z'),
    },
  ];

  const pitStopPoints: RawPoint[] = [
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
          '4': { Line: 1, NumberOfLaps: 12 },
          '81': { Line: 2, NumberOfLaps: 12 },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    },
    {
      type: 'TimingData',
      json: {
        Lines: {
          '4': { Line: 2, NumberOfLaps: 13 },
          '81': { Line: 1, NumberOfLaps: 13 },
        },
      },
      dateTime: new Date('2025-01-01T00:00:13Z'),
    },
    {
      type: 'TyreStintSeries',
      json: {
        Stints: {
          '4': {
            '1': {
              Compound: 'MEDIUM',
              New: 'true',
              StartLaps: 1,
              TotalLaps: 12,
              LapNumber: 12,
            },
            '2': {
              Compound: 'HARD',
              New: 'false',
              StartLaps: 12,
              TotalLaps: 20,
              LapNumber: 13,
            },
          },
          '81': {
            '1': {
              Compound: 'HARD',
              New: 'false',
              StartLaps: 1,
              TotalLaps: 13,
              LapNumber: 13,
            },
            '2': {
              Compound: 'SOFT',
              New: 'true',
              StartLaps: 13,
              TotalLaps: 20,
              LapNumber: 14,
            },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:13.100Z'),
    },
    {
      type: 'PitStopSeries',
      json: {
        PitTimes: {
          '4': {
            '0': {
              Timestamp: '2025-01-01T00:00:12.500Z',
              PitStop: {
                RacingNumber: '4',
                Lap: '12',
                PitStopTime: '2.45',
                PitLaneTime: '22.10',
              },
            },
          },
          '81': {
            '0': {
              Timestamp: '2025-01-01T00:00:13.500Z',
              PitStop: {
                RacingNumber: '81',
                Lap: '13',
                PitStopTime: '3.10',
                PitLaneTime: '23.50',
              },
            },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:13.500Z'),
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

    service.enqueue({
      type: 'SessionInfo',
      json: {
        Key: '3001',
        Name: 'Race',
        Type: 'Race',
        Path: '2025/2025-05-25_Monaco_Grand_Prix/2025-05-25_Race/',
        StartDate: '2025-05-25T15:00:00',
        EndDate: '2025-05-25T17:00:00',
        GmtOffset: '+0200',
        Meeting: {
          Location: 'Monte Carlo',
          Circuit: { Key: 6, ShortName: 'Monaco' },
        },
        CircuitPoints: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        CircuitCorners: [{ number: 1, x: 5.5, y: 6.5 }],
        CircuitRotation: 90,
      },
      dateTime: new Date('2025-01-01T00:00:13Z'),
    });

    expect(api.getLatest('SessionInfo')).toEqual({
      topic: 'SessionInfo',
      streamName: 'SessionInfo',
      availability: 'all-sessions',
      semantics: 'replace',
      source: 'processor',
      dateTime: null,
      data: {
        sessionInfo: {
          Key: 3001,
          Name: 'Race',
          Type: 'Race',
          Path: '2025/2025-05-25_Monaco_Grand_Prix/2025-05-25_Race/',
          StaticPrefix:
            'https://livetiming.formula1.com/static/2025/2025-05-25_Monaco_Grand_Prix/2025-05-25_Race/',
          StartDate: '2025-05-25T15:00:00',
          EndDate: '2025-05-25T17:00:00',
          GmtOffset: '+02:00',
          ScheduledStartUtc: '2025-05-25T13:00:00.000Z',
          IsRace: true,
          IsQualifying: false,
          IsSprint: false,
          Meeting: {
            Key: null,
            Name: null,
            OfficialName: null,
            Location: 'Monte Carlo',
            Country: null,
            Circuit: { Key: 6, ShortName: 'Monaco' },
          },
        },
        circuitGeometry: {
          pointCount: 2,
          cornerCount: 1,
          rotation: 90,
          hasGeometry: true,
          sampleCorners: [{ number: 1, x: 5.5, y: 6.5 }],
        },
        circuitGeometryData: {
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
          corners: [{ number: 1, x: 5.5, y: 6.5 }],
          rotation: 90,
          hasGeometry: true,
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

  it('returns replay-aware stream metadata for audio and content feeds', () => {
    const streamPoints: RawPoint[] = [
      ...points,
      {
        type: 'AudioStreams',
        json: {
          Streams: {
            '0': {
              Name: 'FX',
              Language: 'en',
              Path: 'AudioStreams/FX.m3u8',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:11.000Z'),
      },
      {
        type: 'AudioStreams',
        json: {
          Streams: {
            '1': {
              Name: 'Driver',
              Language: 'de',
              Uri: 'https://cdn.example.test/driver.m3u8',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:12.500Z'),
      },
      {
        type: 'ContentStreams',
        json: {
          Streams: {
            '0': {
              Type: 'Commentary',
              Language: 'en',
              Path: 'Content/commentary-en.json',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:11.500Z'),
      },
      {
        type: 'ContentStreams',
        json: {
          Streams: {
            '1': {
              Type: 'Telemetry',
              Language: 'es',
              Uri: 'https://cdn.example.test/telemetry-es.json',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:12.200Z'),
      },
    ];

    const service = new TimingService();
    streamPoints.forEach((point) => service.enqueue(point));
    const latestApi = createOperatorApi({
      store: buildStore(streamPoints),
      service,
    });

    expect(
      latestApi.getStreamMetadata('AudioStreams', {
        language: 'de',
      }),
    ).toEqual({
      topic: 'AudioStreams',
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'latest',
      },
      total: 1,
      returned: 1,
      languages: ['de'],
      types: [],
      streams: [
        {
          streamId: '1',
          name: 'Driver',
          language: 'de',
          type: null,
          uri: 'https://cdn.example.test/driver.m3u8',
          path: null,
          resolvedUrl: 'https://cdn.example.test/driver.m3u8',
        },
      ],
    });

    const historicalApi = createOperatorApi({
      store: buildStore(streamPoints),
      service,
      timeCursor: { iso: '2025-01-01T00:00:11.800Z' },
    });

    expect(
      historicalApi.getStreamMetadata('AudioStreams', {
        search: 'fx',
      }),
    ).toEqual({
      topic: 'AudioStreams',
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'time',
      },
      total: 1,
      returned: 1,
      languages: ['en'],
      types: [],
      streams: [
        {
          streamId: '0',
          name: 'FX',
          language: 'en',
          type: null,
          uri: null,
          path: 'AudioStreams/FX.m3u8',
          resolvedUrl:
            'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/AudioStreams/FX.m3u8',
        },
      ],
    });

    expect(
      historicalApi.getStreamMetadata('ContentStreams', {
        limit: 5,
      }),
    ).toEqual({
      topic: 'ContentStreams',
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'time',
      },
      total: 1,
      returned: 1,
      languages: ['en'],
      types: ['Commentary'],
      streams: [
        {
          streamId: '0',
          name: null,
          language: 'en',
          type: 'Commentary',
          uri: null,
          path: 'Content/commentary-en.json',
          resolvedUrl:
            'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/Content/commentary-en.json',
        },
      ],
    });
  });

  it('downloads and plays team radio clips through operator workflows', async () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-operator-team-radio-'),
    );
    const fetchImpl = vi.fn(async () => new Response('radio-bytes'));
    const spawnImpl = vi.fn(() => ({
      pid: 4321,
      once: () => undefined,
      unref: () => undefined,
    }));

    try {
      const api = createOperatorApi({
        store: buildStore(points),
        service,
        teamRadioFetchImpl: fetchImpl as typeof fetch,
        teamRadioSpawnImpl: spawnImpl as Parameters<
          typeof createOperatorApi
        >[0]['teamRadioSpawnImpl'],
      });

      const download = await api.downloadTeamRadioCapture({
        captureId: '1',
        destinationDir,
      });

      expect(download).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        bytes: 11,
        filePath: path.join(destinationDir, 'LANNOR01_4_20250101_000011.mp3'),
      });
      expect(readFileSync(download.filePath, 'utf-8')).toBe('radio-bytes');
      expect(api.getTeamRadioEvents({ driverNumber: '4', limit: 1 })).toEqual({
        sessionPrefix:
          'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
        total: 1,
        returned: 1,
        captures: [
          expect.objectContaining({
            captureId: '1',
            downloadedFilePath: download.filePath,
          }),
        ],
      });

      const playback = await api.playTeamRadioCapture({
        captureId: '1',
        destinationDir,
        player: 'ffplay',
      });

      expect(playback).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: true,
        player: 'ffplay',
        command: 'ffplay',
        args: [
          '-nodisp',
          '-autoexit',
          '-loglevel',
          'error',
          path.join(destinationDir, 'LANNOR01_4_20250101_000011.mp3'),
        ],
        pid: 4321,
      });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(spawnImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it('transcribes team radio clips through operator workflows and reuses the cached transcript', async () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-operator-team-radio-transcribe-'),
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('.mp3')) {
          return new Response('radio-bytes');
        }

        expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
        expect(init?.method).toBe('POST');

        return new Response(JSON.stringify({ text: 'Box this lap.' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

    try {
      const api = createOperatorApi({
        store: buildStore(points),
        service,
        teamRadioFetchImpl: fetchImpl,
      });

      const first = await api.transcribeTeamRadioCapture({
        captureId: '1',
        destinationDir,
        apiKey: 'sk-test',
      });

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        backend: 'openai',
        transcription: 'Box this lap.',
        transcriptionReused: false,
        model: 'gpt-4o-transcribe',
        filePath: path.join(destinationDir, 'LANNOR01_4_20250101_000011.mp3'),
      });
      expect(readFileSync(first.filePath, 'utf-8')).toBe('radio-bytes');
      expect(readFileSync(first.transcriptionFilePath, 'utf-8')).toContain(
        'Box this lap.',
      );
      expect(api.getTeamRadioEvents({ driverNumber: '4', limit: 1 })).toEqual({
        sessionPrefix:
          'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
        total: 1,
        returned: 1,
        captures: [
          expect.objectContaining({
            captureId: '1',
            downloadedFilePath: first.filePath,
            hasTranscription: true,
          }),
        ],
      });

      const second = await api.transcribeTeamRadioCapture({
        captureId: '1',
        destinationDir,
        apiKey: 'sk-test',
      });

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        backend: 'openai',
        transcription: 'Box this lap.',
        transcriptionReused: true,
        transcriptionFilePath: first.transcriptionFilePath,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it('supports local team radio transcription through operator workflows', async () => {
    const service = new TimingService();
    points.forEach((point) => service.enqueue(point));
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-operator-team-radio-local-'),
    );
    const fetchImpl = vi.fn(async () => new Response('radio-bytes'));
    const execFileImpl = vi.fn((file, args, _options, callback) => {
      expect(file).toBe('whisper');
      const inputPath = String(args[0]);
      const outputDir = String(args[args.indexOf('--output_dir') + 1]);
      writeFileSync(
        path.join(outputDir, `${path.parse(inputPath).name}.json`),
        JSON.stringify({ text: 'Local box this lap.' }),
      );
      callback(null, '', '');
    });

    try {
      const api = createOperatorApi({
        store: buildStore(points),
        service,
        teamRadioFetchImpl: fetchImpl as typeof fetch,
        teamRadioExecFileImpl: execFileImpl,
      });

      const first = await api.transcribeTeamRadioCapture({
        captureId: '1',
        destinationDir,
        backend: 'local',
      });

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        backend: 'local',
        transcription: 'Local box this lap.',
        transcriptionReused: false,
        model: 'base',
      });

      const second = await api.transcribeTeamRadioCapture({
        captureId: '1',
        destinationDir,
        backend: 'local',
      });

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        backend: 'local',
        transcription: 'Local box this lap.',
        transcriptionReused: true,
        transcriptionFilePath: first.transcriptionFilePath,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(execFileImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
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

  it('returns replay-aware current tyres and tyre stints', () => {
    const service = new TimingService();
    const tyrePoints: RawPoint[] = [
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
            '4': { Line: 1, NumberOfLaps: 12 },
            '81': { Line: 2, NumberOfLaps: 12 },
          },
        },
        dateTime: new Date('2025-01-01T00:00:12Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '4': { Line: 1, NumberOfLaps: 13 },
            '81': { Line: 2, NumberOfLaps: 13 },
          },
        },
        dateTime: new Date('2025-01-01T00:00:13Z'),
      },
      {
        type: 'CurrentTyres',
        json: {
          Tyres: {
            '81': { Compound: 'HARD', New: 'false' },
          },
        },
        dateTime: new Date('2025-01-01T00:00:13.100Z'),
      },
      {
        type: 'TyreStintSeries',
        json: {
          Stints: {
            '4': {
              '1': {
                Compound: 'MEDIUM',
                New: 'true',
                StartLaps: 1,
                TotalLaps: 12,
                LapNumber: 12,
              },
              '2': {
                Compound: 'HARD',
                New: 'false',
                StartLaps: 12,
                TotalLaps: 20,
                LapNumber: 13,
              },
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:13.200Z'),
      },
    ];

    tyrePoints.forEach((point) => service.enqueue(point));

    const latestApi = createOperatorApi({
      store: buildStore(tyrePoints),
      service,
    });

    expect(latestApi.getCurrentTyres()).toEqual({
      asOf: {
        lap: 13,
        dateTime: '2025-01-01T00:00:13.000Z',
        source: 'latest',
      },
      totalDrivers: 2,
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          compound: 'HARD',
          isNew: false,
          tyresNotChanged: null,
          stint: 2,
          startLaps: 12,
          totalLaps: 20,
          lapsOnTyre: 8,
          source: 'TyreStintSeries',
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 2,
          compound: 'HARD',
          isNew: false,
          tyresNotChanged: null,
          stint: null,
          startLaps: null,
          totalLaps: null,
          lapsOnTyre: null,
          source: 'CurrentTyres',
        },
      ],
    });

    expect(latestApi.getTyreStints({ driverNumber: '4' })).toEqual({
      asOf: {
        lap: 13,
        dateTime: '2025-01-01T00:00:13.000Z',
        source: 'latest',
      },
      totalRecords: 2,
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stint: 1,
          compound: 'MEDIUM',
          isNew: true,
          tyresNotChanged: null,
          startLaps: 1,
          totalLaps: 12,
          lapsOnTyre: 11,
          lapTime: null,
          lapNumber: 12,
          source: 'TyreStintSeries',
        },
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stint: 2,
          compound: 'HARD',
          isNew: false,
          tyresNotChanged: null,
          startLaps: 12,
          totalLaps: 20,
          lapsOnTyre: 8,
          lapTime: null,
          lapNumber: 13,
          source: 'TyreStintSeries',
        },
      ],
    });

    const historicalApi = createOperatorApi({
      store: buildStore(tyrePoints),
      service,
      timeCursor: { lap: 12 },
    });

    expect(historicalApi.getCurrentTyres()).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'lap',
      },
      totalDrivers: 1,
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          compound: 'MEDIUM',
          isNew: true,
          tyresNotChanged: null,
          stint: 1,
          startLaps: 1,
          totalLaps: 12,
          lapsOnTyre: 11,
          source: 'TyreStintSeries',
        },
      ],
    });

    expect(historicalApi.getTyreStints({ driverNumber: '4' })).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'lap',
      },
      totalRecords: 1,
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stint: 1,
          compound: 'MEDIUM',
          isNew: true,
          tyresNotChanged: null,
          startLaps: 1,
          totalLaps: 12,
          lapsOnTyre: 11,
          lapTime: null,
          lapNumber: 12,
          source: 'TyreStintSeries',
        },
      ],
    });
  });

  it('returns replay-aware timing stats trap tables and per-driver speeds', () => {
    const service = new TimingService();
    const timingStatsPoints: RawPoint[] = [
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
            '4': { Line: 2, NumberOfLaps: 11 },
            '81': { Line: 1, NumberOfLaps: 11 },
          },
        },
        dateTime: new Date('2025-01-01T00:00:11Z'),
      },
      {
        type: 'TimingStats',
        json: {
          Lines: {
            '4': {
              BestSpeeds: {
                FL: { Value: '338.5', Position: 2 },
                I1: { Value: '295.1', Position: 1 },
              },
            },
            '81': {
              BestSpeeds: {
                FL: { Value: '340.0', Position: 1 },
                I1: { Value: '294.4', Position: 2 },
              },
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:10.900Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '4': { Line: 1, NumberOfLaps: 12 },
            '81': { Line: 2, NumberOfLaps: 12 },
          },
        },
        dateTime: new Date('2025-01-01T00:00:12Z'),
      },
      {
        type: 'TimingStats',
        json: {
          Lines: {
            '4': {
              BestSpeeds: {
                ST: { Value: '319.0', Position: 2 },
              },
            },
            '81': {
              BestSpeeds: {
                ST: { Value: '320.1', Position: 1 },
              },
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:11.900Z'),
      },
    ];

    timingStatsPoints.forEach((point) => service.enqueue(point));

    const latestApi = createOperatorApi({
      store: buildStore(timingStatsPoints),
      service,
    });

    expect(latestApi.getTimingStats({ trap: 'st', limit: 1 })).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'latest',
      },
      requestedTrap: 'ST',
      requestedDriverNumber: null,
      limit: 1,
      totalDrivers: 2,
      driver: null,
      trapTable: {
        trap: 'ST',
        totalDrivers: 2,
        fastest: {
          trap: 'ST',
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 1,
          value: '320.1',
          speedKph: 320.1,
          raw: {
            Value: '320.1',
            Position: 1,
          },
        },
        records: [
          {
            trap: 'ST',
            driverNumber: '81',
            driverName: 'Oscar Piastri',
            position: 1,
            value: '320.1',
            speedKph: 320.1,
            raw: {
              Value: '320.1',
              Position: 1,
            },
          },
        ],
      },
      trapTables: null,
    });

    const historicalApi = createOperatorApi({
      store: buildStore(timingStatsPoints),
      service,
      timeCursor: { lap: 11 },
    });

    expect(historicalApi.getTimingStats({ driverNumber: '4' })).toEqual({
      asOf: {
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        source: 'lap',
      },
      requestedTrap: null,
      requestedDriverNumber: '4',
      limit: null,
      totalDrivers: 2,
      driver: {
        driverNumber: '4',
        driverName: 'Lando Norris',
        bestSpeeds: [
          {
            trap: 'FL',
            position: 2,
            value: '338.5',
            speedKph: 338.5,
            raw: {
              Value: '338.5',
              Position: 2,
            },
          },
          {
            trap: 'I1',
            position: 1,
            value: '295.1',
            speedKph: 295.1,
            raw: {
              Value: '295.1',
              Position: 1,
            },
          },
        ],
        raw: {
          BestSpeeds: {
            FL: { Value: '338.5', Position: 2 },
            I1: { Value: '295.1', Position: 1 },
          },
        },
      },
      trapTable: null,
      trapTables: null,
    });

    expect(historicalApi.getTimingStats({ trap: 'ST' })).toEqual({
      asOf: {
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        source: 'lap',
      },
      requestedTrap: 'ST',
      requestedDriverNumber: null,
      limit: null,
      totalDrivers: 2,
      driver: null,
      trapTable: null,
      trapTables: null,
    });
  });

  it('returns replay-aware driver tracker rows', () => {
    const service = new TimingService();
    const trackerPoints: RawPoint[] = [
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
          SessionPart: 1,
          Lines: {
            '0': {
              Position: '1',
              RacingNumber: '81',
              ShowPosition: true,
              DiffToLeader: 'LEADER',
              OverallFastest: true,
            },
            '1': {
              Position: '2',
              RacingNumber: '4',
              ShowPosition: true,
              DiffToAhead: '+0.900',
              DiffToLeader: '+0.900',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:10Z'),
      },
      {
        type: 'TimingData',
        json: {
          Lines: {
            '4': { Line: 2, NumberOfLaps: 11 },
            '81': { Line: 1, NumberOfLaps: 11 },
          },
        },
        dateTime: new Date('2025-01-01T00:00:11Z'),
      },
      {
        type: 'DriverTracker',
        json: {
          SessionPart: 2,
          Lines: {
            '0': {
              Position: '2',
              RacingNumber: '81',
              DiffToAhead: '+1.100',
              DiffToLeader: '+1.100',
              OverallFastest: false,
            },
            '1': {
              Position: '1',
              RacingNumber: '4',
              DiffToAhead: 'LEADER',
              DiffToLeader: 'LEADER',
              PersonalFastest: true,
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:12Z'),
      },
    ];

    trackerPoints.forEach((point) => service.enqueue(point));

    const latestApi = createOperatorApi({
      store: buildStore(trackerPoints),
      service,
    });

    expect(latestApi.getDriverTracker()).toEqual({
      asOf: {
        source: 'latest',
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        includeFuture: false,
      },
      withheld: false,
      sessionPart: 2,
      driverNumber: null,
      driverName: null,
      total: 2,
      returned: 2,
      rows: [
        {
          lineIndex: 0,
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 2,
          showPosition: true,
          lapTime: null,
          lapState: null,
          diffToAhead: '+1.100',
          diffToAheadSeconds: 1.1,
          diffToLeader: '+1.100',
          diffToLeaderSeconds: 1.1,
          overallFastest: false,
          personalFastest: null,
          raw: {
            Position: '2',
            RacingNumber: '81',
            ShowPosition: true,
            DiffToLeader: '+1.100',
            OverallFastest: false,
            DiffToAhead: '+1.100',
          },
        },
        {
          lineIndex: 1,
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          showPosition: true,
          lapTime: null,
          lapState: null,
          diffToAhead: 'LEADER',
          diffToAheadSeconds: null,
          diffToLeader: 'LEADER',
          diffToLeaderSeconds: null,
          overallFastest: null,
          personalFastest: true,
          raw: {
            Position: '1',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: 'LEADER',
            DiffToLeader: 'LEADER',
            PersonalFastest: true,
          },
        },
      ],
      row: null,
    });

    const historicalApi = createOperatorApi({
      store: buildStore(trackerPoints),
      service,
      timeCursor: { lap: 11 },
    });

    expect(
      historicalApi.getDriverTracker({ driverNumber: '4', limit: 5 }),
    ).toEqual({
      asOf: {
        source: 'lap',
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        includeFuture: false,
      },
      withheld: false,
      sessionPart: 1,
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 1,
      returned: 1,
      rows: [
        {
          lineIndex: 1,
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 2,
          showPosition: true,
          lapTime: null,
          lapState: null,
          diffToAhead: '+0.900',
          diffToAheadSeconds: 0.9,
          diffToLeader: '+0.900',
          diffToLeaderSeconds: 0.9,
          overallFastest: null,
          personalFastest: null,
          raw: {
            Position: '2',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '+0.900',
            DiffToLeader: '+0.900',
          },
        },
      ],
      row: {
        lineIndex: 1,
        driverNumber: '4',
        driverName: 'Lando Norris',
        position: 2,
        showPosition: true,
        lapTime: null,
        lapState: null,
        diffToAhead: '+0.900',
        diffToAheadSeconds: 0.9,
        diffToLeader: '+0.900',
        diffToLeaderSeconds: 0.9,
        overallFastest: null,
        personalFastest: null,
        raw: {
          Position: '2',
          RacingNumber: '4',
          ShowPosition: true,
          DiffToAhead: '+0.900',
          DiffToLeader: '+0.900',
        },
      },
    });

    expect(
      historicalApi.getDriverTracker({ includeFuture: true, limit: 1 }),
    ).toEqual({
      asOf: {
        source: 'lap',
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        includeFuture: true,
      },
      withheld: false,
      sessionPart: 2,
      driverNumber: null,
      driverName: null,
      total: 2,
      returned: 1,
      rows: [
        {
          lineIndex: 0,
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 2,
          showPosition: true,
          lapTime: null,
          lapState: null,
          diffToAhead: '+1.100',
          diffToAheadSeconds: 1.1,
          diffToLeader: '+1.100',
          diffToLeaderSeconds: 1.1,
          overallFastest: false,
          personalFastest: null,
          raw: {
            Position: '2',
            RacingNumber: '81',
            ShowPosition: true,
            DiffToLeader: '+1.100',
            OverallFastest: false,
            DiffToAhead: '+1.100',
          },
        },
      ],
      row: null,
    });
  });

  it('returns replay-aware pit stop events with tyre context', () => {
    const service = new TimingService();
    pitStopPoints.forEach((point) => service.enqueue(point));

    const historicalApi = createOperatorApi({
      store: buildStore(pitStopPoints),
      service,
      timeCursor: { lap: 12 },
    });

    expect(historicalApi.getPitStopEvents()).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'lap',
        includeFuture: false,
      },
      total: 1,
      returned: 1,
      events: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stopNumber: 0,
          lap: 12,
          timestamp: '2025-01-01T00:00:12.500Z',
          dateTime: '2025-01-01T00:00:12.500Z',
          pitStopTime: '2.45',
          pitStopTimeMs: 2450,
          pitLaneTime: '22.10',
          pitLaneTimeMs: 22100,
          tyreBefore: {
            stint: 1,
            compound: 'MEDIUM',
            isNew: true,
            tyresNotChanged: null,
            startLaps: 1,
            totalLaps: 12,
            lapsOnTyre: 11,
            lapNumber: 12,
            source: 'TyreStintSeries',
          },
          tyreAfter: {
            stint: 2,
            compound: 'HARD',
            isNew: false,
            tyresNotChanged: null,
            startLaps: 12,
            totalLaps: 20,
            lapsOnTyre: 8,
            lapNumber: 13,
            source: 'TyreStintSeries',
          },
          source: 'PitStopSeries',
        },
      ],
    });

    expect(
      historicalApi.getPitStopEvents({
        includeFuture: true,
        order: 'desc',
        limit: 1,
      }),
    ).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'lap',
        includeFuture: true,
      },
      total: 2,
      returned: 1,
      events: [
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          stopNumber: 0,
          lap: 13,
          timestamp: '2025-01-01T00:00:13.500Z',
          dateTime: '2025-01-01T00:00:13.500Z',
          pitStopTime: '3.10',
          pitStopTimeMs: 3100,
          pitLaneTime: '23.50',
          pitLaneTimeMs: 23500,
          tyreBefore: {
            stint: 1,
            compound: 'HARD',
            isNew: false,
            tyresNotChanged: null,
            startLaps: 1,
            totalLaps: 13,
            lapsOnTyre: 12,
            lapNumber: 13,
            source: 'TyreStintSeries',
          },
          tyreAfter: {
            stint: 2,
            compound: 'SOFT',
            isNew: true,
            tyresNotChanged: null,
            startLaps: 13,
            totalLaps: 20,
            lapsOnTyre: 7,
            lapNumber: 14,
            source: 'TyreStintSeries',
          },
          source: 'PitStopSeries',
        },
      ],
    });
  });

  it('returns replay-aware position snapshots from Position and CarData feeds', () => {
    const service = new TimingService();
    positionPoints.forEach((point) => service.enqueue(point));

    const api = createOperatorApi({
      store: buildStore(positionPoints),
      service,
    });

    expect(api.getPositionSnapshot()).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.000Z',
        source: 'latest',
      },
      positionTimestamp: '2025-01-01T00:00:12.500Z',
      telemetryUtc: '2025-01-01T00:00:12.500Z',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 1,
          status: 'OffTrack',
          offTrack: true,
          coordinates: { x: 11, y: 21, z: 1 },
          telemetry: {
            rpm: null,
            speed: 305,
            gear: 8,
            throttle: null,
            brake: null,
            drs: null,
          },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          timingPosition: 2,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 31, y: 41, z: 2 },
          telemetry: {
            rpm: null,
            speed: 300,
            gear: 7,
            throttle: null,
            brake: null,
            drs: null,
          },
        },
      ],
    });

    const historicalApi = createOperatorApi({
      store: buildStore(positionPoints),
      service,
      timeCursor: { lap: 11 },
    });

    expect(historicalApi.getPositionSnapshot({ driverNumber: 4 })).toEqual({
      asOf: {
        lap: 11,
        dateTime: '2025-01-01T00:00:11.000Z',
        source: 'lap',
      },
      positionTimestamp: '2025-01-01T00:00:11.500Z',
      telemetryUtc: '2025-01-01T00:00:11.500Z',
      totalDrivers: 1,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 2,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 10, y: 20, z: 1 },
          telemetry: {
            rpm: null,
            speed: 301,
            gear: 8,
            throttle: null,
            brake: null,
            drs: null,
          },
        },
      ],
    });
  });

  it('reconstructs exact-time position snapshots within the latest lap', () => {
    const service = new TimingService();
    exactTimePositionPoints.forEach((point) => service.enqueue(point));

    const api = createOperatorApi({
      store: buildStore(exactTimePositionPoints),
      service,
      timeCursor: { iso: '2025-01-01T00:00:12.300Z' },
    });

    expect(api.getPositionSnapshot()).toEqual({
      asOf: {
        lap: 12,
        dateTime: '2025-01-01T00:00:12.300Z',
        source: 'time',
      },
      positionTimestamp: '2025-01-01T00:00:12.260Z',
      telemetryUtc: '2025-01-01T00:00:12.270Z',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 1,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 10, y: 20, z: 1 },
          telemetry: {
            rpm: null,
            speed: 302,
            gear: 8,
            throttle: null,
            brake: null,
            drs: null,
          },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          timingPosition: 2,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 30, y: 40, z: 2 },
          telemetry: {
            rpm: null,
            speed: 298,
            gear: 7,
            throttle: null,
            brake: null,
            drs: null,
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
