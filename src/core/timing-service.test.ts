import { describe, it, expect, vi } from 'vitest';
import { TimingService } from './timing-service.js';

const points = [
  {
    type: 'DriverList',
    json: { '1': { FullName: 'Max Verstappen' } },
    dateTime: new Date('2025-01-01T00:00:01Z'),
  },
  {
    type: 'TimingData',
    json: { Lines: { '1': { BestLapTime: { Value: '1:20.000' } } } },
    dateTime: new Date('2025-01-01T00:00:02Z'),
  },
];

describe('TimingService', () => {
  it('routes points to processors and tracks best laps', () => {
    const service = new TimingService();
    points.forEach((p) => service.enqueue(p));
    expect((service.processors.driverList.latest as any)?.['1']?.FullName).toBe(
      'Max Verstappen',
    );
    expect(service.processors.timingData.bestLaps.get('1')?.time).toBe(
      '1:20.000',
    );
  });

  it('routes TimingStats through the dedicated processor with ordered trap tables', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'TimingStats',
      json: {
        Lines: {
          '4': {
            BestSpeeds: {
              FL: { Value: '338.5', Position: 2 },
            },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'TimingStats',
      json: {
        Lines: {
          '81': {
            BestSpeeds: {
              FL: { Value: '340.0', Position: 1 },
              ST: { Value: '320.1', Position: 1 },
            },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(
      service.processors.timingStats.getTrapTable({ trap: 'FL' }),
    ).toMatchObject({
      trap: 'FL',
      totalDrivers: 2,
      records: [
        {
          driverNumber: '81',
          position: 1,
          speedKph: 340,
        },
        {
          driverNumber: '4',
          position: 2,
          speedKph: 338.5,
        },
      ],
    });
    expect(
      service.processors.timingStats.getTrapTables().map((table) => table.trap),
    ).toEqual(['FL', 'ST']);
  });

  it('routes SessionInfo through the circuit-enriching processor', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ X: [1, 2], Y: [3, 4], Rotation: 45 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const service = new TimingService();

      service.enqueue({
        type: 'SessionInfo',
        json: {
          Path: '2025/2025-01-01_Test_Event/2025-01-01_Race/',
          Meeting: {
            Circuit: {
              Key: 55,
              ShortName: 'Test Circuit',
            },
          },
        },
        dateTime: new Date('2025-01-01T00:00:00Z'),
      });

      await service.processors.sessionInfo.waitForCircuitData();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://undercutf1.amandhoot.com/api/v1/circuits/55/2025',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(service.processors.sessionInfo.state).toMatchObject({
        CircuitPoints: [
          { x: 1, y: 3 },
          { x: 2, y: 4 },
        ],
        CircuitRotation: 45,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('routes TimingDataF1 into the primary timing processor', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'TimingDataF1',
      json: {
        Lines: {
          '81': {
            Line: 1,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:29.999' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:03Z'),
    });

    expect(service.processors.timingData.state).toEqual({
      Lines: {
        '81': {
          Line: 1,
          NumberOfLaps: 12,
          BestLapTime: { Value: '1:29.999' },
        },
      },
    });
    expect(service.processors.timingData.bestLaps.get('81')?.time).toBe(
      '1:29.999',
    );
    expect(service.processors.timingData.getLapNumbers()).toEqual([12]);
  });

  it('merges SessionData patches after normalizing array keyframes', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'SessionData',
      json: {
        Series: [
          { Utc: '2026-03-07T04:47:25.938Z', QualifyingPart: 0 },
          { Utc: '2026-03-07T04:47:26.891Z', QualifyingPart: 1 },
        ],
        StatusSeries: [
          { Utc: '2026-03-07T05:00:00.195Z', SessionStatus: 'Started' },
        ],
      },
      dateTime: new Date('2026-03-07T05:00:00Z'),
    });
    service.enqueue({
      type: 'SessionData',
      json: {
        StatusSeries: {
          '1': { Utc: '2026-03-07T05:10:31.433Z', SessionStatus: 'Aborted' },
        },
      },
      dateTime: new Date('2026-03-07T05:10:31Z'),
    });
    service.enqueue({
      type: 'SessionData',
      json: {
        Series: {
          '2': { Utc: '2026-03-07T05:33:00.090Z', QualifyingPart: 2 },
        },
      },
      dateTime: new Date('2026-03-07T05:33:00Z'),
    });

    expect(service.processors.sessionData.state).toEqual({
      Series: {
        '0': { Utc: '2026-03-07T04:47:25.938Z', QualifyingPart: 0 },
        '1': { Utc: '2026-03-07T04:47:26.891Z', QualifyingPart: 1 },
        '2': { Utc: '2026-03-07T05:33:00.090Z', QualifyingPart: 2 },
      },
      StatusSeries: {
        '0': { Utc: '2026-03-07T05:00:00.195Z', SessionStatus: 'Started' },
        '1': { Utc: '2026-03-07T05:10:31.433Z', SessionStatus: 'Aborted' },
      },
    });
  });

  it('stores deterministic best-lap snapshots for replay tooling', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Line: 2,
            NumberOfLaps: 11,
            BestLapTime: { Value: '1:31.500', Lap: 11 },
            LastLapTime: { Value: '1:31.500' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:11Z'),
    });
    service.enqueue({
      type: 'TimingData',
      json: {
        Lines: {
          '4': {
            Line: 1,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.100', Lap: 12 },
            LastLapTime: { Value: '1:30.100' },
            GapToLeader: 'LAP 12',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:12Z'),
    });

    expect(service.processors.timingData.bestLaps.get('4')).toMatchObject({
      time: '1:30.100',
      timeMs: 90_100,
      lap: 12,
    });
    expect(service.processors.timingData.getBestLapSnapshot('4')).toMatchObject(
      {
        time: '1:30.100',
        lap: 12,
        snapshot: {
          Line: 1,
          NumberOfLaps: 12,
          BestLapTime: { Value: '1:30.100', Lap: 12 },
          LastLapTime: { Value: '1:30.100' },
          GapToLeader: 'LAP 12',
        },
      },
    );
  });

  it('merges auxiliary patch topics into deterministic state', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'CurrentTyres',
      json: { Tyres: { '1': { Compound: 'SOFT', New: true } } },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'CurrentTyres',
      json: { Tyres: { '4': { Compound: 'MEDIUM', New: false } } },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(service.processors.extraTopics.CurrentTyres.state).toEqual({
      Tyres: {
        '1': { Compound: 'SOFT', New: true },
        '4': { Compound: 'MEDIUM', New: false },
      },
    });
  });

  it('replaces generic replace-style topic snapshots instead of retaining stale keys', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'WeatherData',
      json: {
        AirTemp: '21',
        TrackTemp: '33',
        Rainfall: '0',
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'WeatherData',
      json: {
        AirTemp: '22',
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    service.enqueue({
      type: 'LapCount',
      json: {
        CurrentLap: 11,
        TotalLaps: 57,
      },
      dateTime: new Date('2025-01-01T00:00:03Z'),
    });
    service.enqueue({
      type: 'LapCount',
      json: {
        CurrentLap: 12,
      },
      dateTime: new Date('2025-01-01T00:00:04Z'),
    });

    service.enqueue({
      type: 'PitStop',
      json: {
        PitStops: {
          '4': {
            Lap: 10,
            Duration: '23.4',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:05Z'),
    });
    service.enqueue({
      type: 'PitStop',
      json: {
        PitStops: {
          '81': {
            Lap: 11,
            Duration: '22.9',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:06Z'),
    });

    expect(service.processors.weatherData.state).toEqual({
      AirTemp: 22,
    });
    expect(service.processors.lapCount.state).toEqual({
      CurrentLap: 12,
    });
    expect(service.processors.pitStop.state).toEqual({
      PitStops: {
        '81': {
          Lap: 11,
          Duration: '22.9',
        },
      },
    });
  });

  it('routes DriverRaceInfo through the dedicated processor with ordered rows', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'DriverList',
      json: {
        '4': { FullName: 'Lando Norris' },
        '81': { FullName: 'Oscar Piastri' },
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'DriverRaceInfo',
      json: {
        '81': { Position: '2', Gap: '+2.0', Interval: '+2.0', PitStops: 0 },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });
    service.enqueue({
      type: 'DriverRaceInfo',
      json: {
        '4': {
          Position: '1',
          Gap: 'LEADER',
          Interval: 'LEADER',
          PitStops: 1,
        },
        '81': { Catching: 1 },
      },
      dateTime: new Date('2025-01-01T00:00:03Z'),
    });

    expect(service.processors.driverRaceInfo.state).toEqual({
      '4': {
        Position: '1',
        Gap: 'LEADER',
        Interval: 'LEADER',
        PitStops: 1,
      },
      '81': {
        Position: '2',
        Gap: '+2.0',
        Interval: '+2.0',
        PitStops: 0,
        Catching: 1,
      },
    });
    expect(
      service.processors.driverRaceInfo.getRows({
        driverListState: service.processors.driverList.state,
      }),
    ).toMatchObject([
      {
        driverNumber: '4',
        driverName: 'Lando Norris',
        position: 1,
        pitStops: 1,
      },
      {
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        position: 2,
        gapSeconds: 2,
        catching: 1,
      },
    ]);
  });

  it('routes DriverTracker through the dedicated processor with ordered board rows', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'DriverList',
      json: {
        '4': { FullName: 'Lando Norris' },
        '81': { FullName: 'Oscar Piastri' },
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'DriverTracker',
      json: {
        Withheld: false,
        Lines: [
          {
            Position: '1',
            RacingNumber: '81',
            ShowPosition: true,
            DiffToLeader: 'LEADER',
          },
          {
            Position: '2',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '+0.9',
            DiffToLeader: '+0.9',
            LapState: 80,
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });
    service.enqueue({
      type: 'DriverTracker',
      json: {
        SessionPart: 2,
        Lines: {
          '1': {
            LapTime: '1:31.200',
            PersonalFastest: true,
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:03Z'),
    });

    expect(service.processors.driverTracker.state).toEqual({
      Withheld: false,
      SessionPart: 2,
      Lines: {
        '0': {
          Position: '1',
          RacingNumber: '81',
          ShowPosition: true,
          DiffToLeader: 'LEADER',
        },
        '1': {
          Position: '2',
          RacingNumber: '4',
          ShowPosition: true,
          DiffToAhead: '+0.9',
          DiffToLeader: '+0.9',
          LapState: 80,
          LapTime: '1:31.200',
          PersonalFastest: true,
        },
      },
    });
    expect(
      service.processors.driverTracker.getRows({
        driverListState: service.processors.driverList.state,
      }),
    ).toMatchObject([
      {
        lineIndex: 0,
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        position: 1,
        diffToLeader: 'LEADER',
      },
      {
        lineIndex: 1,
        driverNumber: '4',
        driverName: 'Lando Norris',
        position: 2,
        lapTime: '1:31.200',
        diffToAheadSeconds: 0.9,
        personalFastest: true,
      },
    ]);
  });

  it('normalizes auxiliary array payloads before merging', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'WeatherDataSeries',
      json: {
        Series: [
          { Timestamp: '2025-01-01T00:00:00Z', Weather: { TrackTemp: '30' } },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'WeatherDataSeries',
      json: {
        Series: {
          '1': {
            Timestamp: '2025-01-01T00:01:00Z',
            Weather: { TrackTemp: '32' },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(service.processors.extraTopics.WeatherDataSeries.state).toEqual({
      Series: {
        '0': {
          Timestamp: '2025-01-01T00:00:00Z',
          Weather: { TrackTemp: '30' },
        },
        '1': {
          Timestamp: '2025-01-01T00:01:00Z',
          Weather: { TrackTemp: '32' },
        },
      },
    });
  });

  it('normalizes stream metadata array payloads before merging', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'AudioStreams',
      json: {
        Streams: [
          { Name: 'Main', Language: 'en', Path: 'AudioStreams/main.m3u8' },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });
    service.enqueue({
      type: 'AudioStreams',
      json: {
        Streams: {
          '1': {
            Name: 'FX',
            Language: 'en',
            Path: 'AudioStreams/fx.m3u8',
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(service.processors.extraTopics.AudioStreams.state).toEqual({
      Streams: {
        '0': {
          Name: 'Main',
          Language: 'en',
          Path: 'AudioStreams/main.m3u8',
        },
        '1': {
          Name: 'FX',
          Language: 'en',
          Path: 'AudioStreams/fx.m3u8',
        },
      },
    });
  });
  it('routes TimingAppData through the dedicated processor helpers', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'TimingAppData',
      json: {
        Lines: {
          '4': {
            Stints: [
              {
                Compound: 'SOFT',
                StartLaps: 0,
                TotalLaps: 10,
              },
            ],
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:01Z'),
    });

    service.enqueue({
      type: 'TimingAppData',
      json: {
        Lines: {
          '4': {
            Line: 1,
            Stints: {
              '1': {
                Compound: 'MEDIUM',
                StartLaps: 10,
                TotalLaps: 20,
              },
            },
          },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(service.processors.timingAppData.getLine('4')).toMatchObject({
      Line: 1,
    });
    expect(service.processors.timingAppData.getStints('4')).toEqual([
      [
        '0',
        {
          Compound: 'SOFT',
          StartLaps: 0,
          TotalLaps: 10,
        },
      ],
      [
        '1',
        {
          Compound: 'MEDIUM',
          StartLaps: 10,
          TotalLaps: 20,
        },
      ],
    ]);
  });

  it('routes TeamRadio through the dedicated processor helpers', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'TeamRadio',
      json: {
        Captures: [
          {
            Utc: '2025-01-01T00:00:01Z',
            RacingNumber: '81',
            Path: 'TeamRadio/OSCPIA01_81_20250101_000001.mp3',
          },
          {
            Utc: '2025-01-01T00:00:02Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20250101_000002.mp3',
          },
        ],
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });

    expect(service.processors.teamRadio.getCaptureCount()).toBe(2);
    expect(
      service.processors.teamRadio.getLatestCapture({
        staticPrefix:
          'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/',
      }),
    ).toMatchObject({
      captureId: '1',
      driverNumber: '4',
      assetUrl:
        'https://livetiming.formula1.com/static/2025/Test_Weekend/Race/TeamRadio/LANNOR01_4_20250101_000002.mp3',
    });
  });

  it('routes ExtrapolatedClock through the dedicated clock processor', () => {
    const service = new TimingService();

    service.enqueue({
      type: 'ExtrapolatedClock',
      json: {
        Utc: '2025-01-01T12:00:00Z',
        Remaining: '00:05:00',
        Extrapolating: true,
      },
      dateTime: new Date('2025-01-01T12:00:00Z'),
    });

    expect(
      service.processors.extrapolatedClock.getRemainingAt(
        new Date('2025-01-01T12:00:30Z'),
      ),
    ).toMatchObject({
      remainingMs: 270_000,
      extrapolating: true,
    });
  });
});
