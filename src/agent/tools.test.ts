import path from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTools } from './tools.js';

let capturedToolHandler:
  | ((name: string, args: unknown) => Promise<unknown>)
  | undefined;
let runMock: ReturnType<typeof vi.fn>;
let initMock: ReturnType<typeof vi.fn>;

vi.mock('./pyodide/client.js', () => ({
  createPythonClient: (opts?: {
    toolHandler?: (name: string, args: unknown) => Promise<unknown>;
  }) => {
    capturedToolHandler = opts?.toolHandler;
    initMock = vi.fn().mockResolvedValue(undefined);
    return {
      init: initMock,
      run: (...args: Parameters<NonNullable<typeof runMock>>) =>
        runMock(...args),
      shutdown: vi.fn(),
    };
  },
}));

const store = {
  topic: () => ({
    latest: { type: 'TimingData', json: { Lines: {} }, dateTime: new Date() },
  }),
  raw: { subscribe: {}, live: [] },
} as any;
const processors = {
  timingData: { bestLaps: new Map(), getLapHistory: () => [], state: {} },
  driverList: { state: {} },
} as any;

describe('tools', () => {
  beforeEach(() => {
    capturedToolHandler = undefined;
    runMock = vi.fn().mockResolvedValue({ ok: true, value: null });
    initMock?.mockClear?.();
  });

  it('exposes expected tools', () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(tools).toHaveProperty('get_data_book_index');
    expect(tools).toHaveProperty('get_topic_reference');
    expect(tools).toHaveProperty('get_download_manifest');
    expect(tools).toHaveProperty('get_keyframe');
    expect(tools).toHaveProperty('get_stint_pace');
    expect(tools).toHaveProperty('compare_drivers');
    expect(tools).toHaveProperty('get_undercut_window');
    expect(tools).toHaveProperty('simulate_rejoin');
    expect(tools).toHaveProperty('get_drs_state');
    expect(tools).toHaveProperty('get_drs_usage');
    expect(tools).toHaveProperty('get_drs_trains');
    expect(tools).toHaveProperty('get_sc_vsc_deltas');
    expect(tools).toHaveProperty('get_pit_loss_estimate');
    expect(tools).toHaveProperty('get_position_changes');
    expect(tools).toHaveProperty('get_race_control_events');
    expect(tools).toHaveProperty('get_driver_tracker');
    expect(tools).toHaveProperty('get_driver_race_info');
    expect(tools).toHaveProperty('get_overtake_series');
    expect(tools).toHaveProperty('get_team_radio_events');
    expect(tools).toHaveProperty('play_team_radio');
    expect(tools).toHaveProperty('get_current_tyres');
    expect(tools).toHaveProperty('get_tyre_stints');
    expect(tools).toHaveProperty('get_lap_series');
    expect(tools).toHaveProperty('get_pit_stop_events');
    expect(tools).toHaveProperty('get_weather_series');
    expect(tools).toHaveProperty('get_content_streams');
    expect(tools).toHaveProperty('get_audio_streams');
    expect(tools).toHaveProperty('get_lap_snapshot');
    expect(tools).toHaveProperty('get_best_laps');
    expect(tools).toHaveProperty('download_team_radio');
    expect(tools).toHaveProperty('transcribe_team_radio');
    expect(tools).toHaveProperty('set_time_cursor');
  });

  it('get_topic_reference shows enriched SessionInfo circuit geometry', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        sessionInfo: {
          state: {
            Name: 'Race',
            Type: 'Race',
            Path: '2025/2025-05-25_Test_Weekend/2025-05-25_Race/',
            Meeting: {
              Location: 'Monaco',
              Circuit: { Key: 6, ShortName: 'Monaco' },
            },
            CircuitPoints: [
              { x: 1, y: 2 },
              { x: 3, y: 4 },
            ],
            CircuitCorners: [{ number: 1, x: 5.5, y: 6.5 }],
            CircuitRotation: 90,
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'SessionInfo',
      includeExample: true,
    } as any);

    expect(result).toMatchObject({
      canonicalTopic: 'SessionInfo',
      found: true,
      present: true,
      example: {
        sessionInfo: {
          Name: 'Race',
          Type: 'Race',
          Path: '2025/2025-05-25_Test_Weekend/2025-05-25_Race/',
          Meeting: {
            Location: 'Monaco',
            Circuit: { Key: 6, ShortName: 'Monaco' },
          },
        },
        circuitGeometry: {
          pointCount: 2,
          cornerCount: 1,
          rotation: 90,
          sampleCorners: [{ number: 1, x: 5.5, y: 6.5 }],
        },
      },
    });
  });

  it('get_audio_streams returns resolved playback metadata', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: {
            SessionInfo: {
              Path: '2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        extraTopics: {
          AudioStreams: {
            state: {
              Streams: {
                '10': {
                  Name: 'FX',
                  Language: 'en',
                  Path: 'AudioStreams/FX.m3u8',
                },
                '2': {
                  Name: 'Driver',
                  Language: 'de',
                  Uri: 'https://cdn.example.test/driver.m3u8',
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_audio_streams.execute({ limit: 10 } as any);

    expect(result).toEqual({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
      total: 2,
      returned: 2,
      languages: ['de', 'en'],
      types: [],
      streams: [
        {
          streamId: '2',
          name: 'Driver',
          language: 'de',
          type: null,
          uri: 'https://cdn.example.test/driver.m3u8',
          path: null,
          resolvedUrl: 'https://cdn.example.test/driver.m3u8',
        },
        {
          streamId: '10',
          name: 'FX',
          language: 'en',
          type: null,
          uri: null,
          path: 'AudioStreams/FX.m3u8',
          resolvedUrl:
            'https://livetiming.formula1.com/static/2025/2025-03-01_Test_Weekend/2025-03-01_Race/AudioStreams/FX.m3u8',
        },
      ],
    });
  });

  it('get_content_streams filters deterministic metadata by language and search text', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: {
            SessionInfo: {
              Path: '2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        extraTopics: {
          ContentStreams: {
            state: {
              Streams: {
                '0': {
                  Type: 'Commentary',
                  Language: 'en',
                  Path: 'Content/commentary-en.json',
                },
                '1': {
                  Type: 'Telemetry',
                  Language: 'es',
                  Uri: 'https://cdn.example.test/telemetry-es.json',
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_content_streams.execute({
      language: 'en',
      search: 'commentary',
    } as any);

    expect(result).toEqual({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
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
            'https://livetiming.formula1.com/static/2025/2025-03-01_Test_Weekend/2025-03-01_Race/Content/commentary-en.json',
        },
      ],
    });
  });

  it('get_race_control_events returns typed events filtered by the current cursor', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Position: '1' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [14, 15],
          driversByLap: new Map([
            [
              14,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2024-05-26T12:15:00Z'),
                    NumberOfLaps: 14,
                    Position: '1',
                  },
                ],
              ]),
            ],
            [
              15,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2024-05-26T12:16:00Z'),
                    NumberOfLaps: 15,
                    Position: '1',
                  },
                ],
              ]),
            ],
          ]),
        },
        raceControlMessages: {
          state: {
            Messages: {
              '0': {
                Utc: '2024-05-26T12:14:40',
                Lap: 14,
                Category: 'Flag',
                Flag: 'YELLOW',
                Scope: 'Sector',
                Sector: 2,
                Message: 'YELLOW IN TRACK SECTOR 2',
              },
              '1': {
                Utc: '2024-05-26T12:15:40',
                Lap: 15,
                Category: 'Flag',
                Flag: 'CLEAR',
                Scope: 'Sector',
                Sector: 2,
                Message: 'CLEAR IN TRACK SECTOR 2',
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 14 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_race_control_events.execute({
      category: 'flag',
    } as any);

    expect(result).toEqual({
      asOf: {
        source: 'lap',
        lap: 14,
        dateTime: new Date('2024-05-26T12:15:00.000Z'),
        includeFuture: false,
      },
      total: 1,
      returned: 1,
      events: [
        {
          messageId: '0',
          utc: '2024-05-26T12:14:40',
          dateTime: '2024-05-26T12:14:40.000Z',
          lap: 14,
          category: 'Flag',
          flag: 'YELLOW',
          scope: 'Sector',
          sector: 2,
          status: null,
          driverNumber: null,
          message: 'YELLOW IN TRACK SECTOR 2',
        },
      ],
    });
  });

  it('get_weather_series returns cursor-aware typed weather samples', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Position: '1' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [14, 15],
          driversByLap: new Map([
            [
              14,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2026-03-07T04:49:30Z'),
                    NumberOfLaps: 14,
                    Position: '1',
                  },
                ],
              ]),
            ],
            [
              15,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2026-03-07T04:50:30Z'),
                    NumberOfLaps: 15,
                    Position: '1',
                  },
                ],
              ]),
            ],
          ]),
        },
        weatherData: {
          state: {
            AirTemp: '20.4',
            Humidity: '67.7',
            Pressure: '1013.7',
            Rainfall: '1',
            TrackTemp: '36.9',
            WindDirection: '94',
            WindSpeed: '2.7',
          },
        },
        extraTopics: {
          WeatherDataSeries: {
            state: {
              Series: {
                '0': {
                  Timestamp: '2026-03-07T04:49:11.917Z',
                  Weather: {
                    AirTemp: '20.5',
                    Humidity: '67.5',
                    Pressure: '1013.5',
                    Rainfall: '0',
                    TrackTemp: '37.3',
                    WindDirection: '85',
                    WindSpeed: '2.2',
                  },
                },
                '1': {
                  Timestamp: '2026-03-07T04:50:11.926Z',
                  Weather: {
                    AirTemp: '20.4',
                    Humidity: '67.7',
                    Pressure: '1013.7',
                    Rainfall: '1',
                    TrackTemp: '36.9',
                    WindDirection: '94',
                    WindSpeed: '2.7',
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 14 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_weather_series.execute({} as any);

    expect(result).toEqual({
      asOf: {
        source: 'lap',
        lap: 14,
        dateTime: new Date('2026-03-07T04:49:30.000Z'),
        includeFuture: false,
      },
      total: 2,
      returned: 1,
      order: 'asc',
      summary: {
        samples: 1,
        fromTime: '2026-03-07T04:49:11.917Z',
        toTime: '2026-03-07T04:49:11.917Z',
        airTempStartC: 20.5,
        airTempEndC: 20.5,
        airTempDeltaC: 0,
        trackTempStartC: 37.3,
        trackTempEndC: 37.3,
        trackTempDeltaC: 0,
        minAirTempC: 20.5,
        maxAirTempC: 20.5,
        minTrackTempC: 37.3,
        maxTrackTempC: 37.3,
        rainfallSamples: 0,
        maxWindSpeed: 2.2,
      },
      samples: [
        {
          sampleId: '0',
          timestamp: '2026-03-07T04:49:11.917Z',
          airTempC: 20.5,
          humidityPct: 67.5,
          pressureHpa: 1013.5,
          rainfall: 0,
          trackTempC: 37.3,
          windDirectionDeg: 85,
          windSpeed: 2.2,
          source: 'WeatherDataSeries',
        },
      ],
    });
  });

  it('get_driver_race_info returns cursor-aware typed rows', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (topic: string) => {
          if (topic === 'DriverRaceInfo') {
            return {
              latest: null,
              timeline: (_from?: Date, to?: Date) => {
                const points = [
                  {
                    type: 'DriverRaceInfo',
                    json: {
                      '81': {
                        Position: '2',
                        Gap: '+1.8',
                        Interval: '+1.8',
                        PitStops: 0,
                      },
                    },
                    dateTime: new Date('2025-01-01T12:01:00Z'),
                  },
                  {
                    type: 'DriverRaceInfo',
                    json: {
                      '4': {
                        Position: '1',
                        Gap: 'LEADER',
                        Interval: 'LEADER',
                        PitStops: 1,
                      },
                      '81': { Catching: true },
                    },
                    dateTime: new Date('2025-01-01T12:03:00Z'),
                  },
                ];

                return points.filter((point) => !to || point.dateTime <= to);
              },
            };
          }

          return {
            latest: null,
            timeline: () => [],
          };
        },
        raw: {
          subscribe: {
            DriverRaceInfo: {
              '4': {
                Position: '3',
                Gap: '+6.0',
                Interval: '+6.0',
                PitStops: 0,
              },
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
            '81': { FullName: 'Oscar Piastri' },
          },
        },
        timingData: {
          ...processors.timingData,
          getLapNumbers: () => [10, 11],
          driversByLap: new Map([
            [
              10,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:00:00Z') }],
              ]),
            ],
            [
              11,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:02:00Z') }],
              ]),
            ],
          ]),
        },
      } as any,
      timeCursor: { lap: 11 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_driver_race_info.execute({} as any);

    expect(result).toEqual({
      asOf: {
        source: 'lap',
        lap: 11,
        dateTime: new Date('2025-01-01T12:02:00Z'),
      },
      includeFuture: false,
      total: 2,
      rows: [
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 2,
          gap: '+1.8',
          gapSeconds: 1.8,
          interval: '+1.8',
          intervalSeconds: 1.8,
          pitStops: 0,
          catching: null,
          overtakeState: null,
          raw: {
            Position: '2',
            Gap: '+1.8',
            Interval: '+1.8',
            PitStops: 0,
          },
        },
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 3,
          gap: '+6.0',
          gapSeconds: 6,
          interval: '+6.0',
          intervalSeconds: 6,
          pitStops: 0,
          catching: null,
          overtakeState: null,
          raw: {
            Position: '3',
            Gap: '+6.0',
            Interval: '+6.0',
            PitStops: 0,
          },
        },
      ],
    });

    const latest = await tools.get_driver_race_info.execute({
      includeFuture: true,
      driverNumber: '4',
    } as any);

    expect(latest).toMatchObject({
      includeFuture: true,
      total: 1,
      rows: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          gap: 'LEADER',
          pitStops: 1,
        },
      ],
    });
  });

  it('get_driver_tracker returns cursor-aware typed board rows', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (topic: string) => {
          if (topic === 'DriverTracker') {
            return {
              latest: {
                type: 'DriverTracker',
                json: {
                  Withheld: false,
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
                    },
                  },
                },
                dateTime: new Date('2025-01-01T00:01:00Z'),
              },
              timeline: (_from?: Date, to?: Date) => {
                const points = [
                  {
                    type: 'DriverTracker',
                    json: {
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
                          DiffToAhead: '+0.9',
                          DiffToLeader: '+0.9',
                          LapState: 80,
                        },
                      },
                    },
                    dateTime: new Date('2025-01-01T12:01:00Z'),
                  },
                  {
                    type: 'DriverTracker',
                    json: {
                      SessionPart: 2,
                      Lines: {
                        '1': {
                          Position: '1',
                          DiffToAhead: '',
                          DiffToLeader: 'LEADER',
                          LapTime: '1:30.500',
                          PersonalFastest: true,
                        },
                        '0': {
                          Position: '2',
                          DiffToAhead: '+0.5',
                          DiffToLeader: '+0.5',
                        },
                      },
                    },
                    dateTime: new Date('2025-01-01T12:03:00Z'),
                  },
                ];

                return points.filter((point) => !to || point.dateTime <= to);
              },
            };
          }

          return {
            latest: null,
            timeline: () => [],
          };
        },
        raw: {
          subscribe: {
            DriverTracker: {
              Withheld: false,
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
            '81': { FullName: 'Oscar Piastri' },
          },
          getName: (driverNumber: string) =>
            driverNumber === '4'
              ? 'Lando Norris'
              : driverNumber === '81'
                ? 'Oscar Piastri'
                : null,
        },
        timingData: {
          ...processors.timingData,
          getLapNumbers: () => [10, 11],
          driversByLap: new Map([
            [
              10,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:00:00Z') }],
              ]),
            ],
            [
              11,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:02:00Z') }],
              ]),
            ],
          ]),
        },
      } as any,
      timeCursor: { lap: 11 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_driver_tracker.execute({} as any);

    expect(result).toEqual({
      asOf: {
        source: 'lap',
        lap: 11,
        dateTime: new Date('2025-01-01T12:02:00Z'),
        includeFuture: false,
      },
      withheld: false,
      sessionPart: null,
      total: 2,
      returned: 2,
      rows: [
        {
          lineIndex: 0,
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          position: 1,
          showPosition: true,
          lapTime: null,
          lapState: null,
          diffToAhead: null,
          diffToAheadSeconds: null,
          diffToLeader: 'LEADER',
          diffToLeaderSeconds: null,
          overallFastest: true,
          personalFastest: null,
          raw: {
            Position: '1',
            RacingNumber: '81',
            ShowPosition: true,
            DiffToLeader: 'LEADER',
            OverallFastest: true,
          },
        },
        {
          lineIndex: 1,
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 2,
          showPosition: true,
          lapTime: null,
          lapState: 80,
          diffToAhead: '+0.9',
          diffToAheadSeconds: 0.9,
          diffToLeader: '+0.9',
          diffToLeaderSeconds: 0.9,
          overallFastest: null,
          personalFastest: null,
          raw: {
            Position: '2',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '+0.9',
            DiffToLeader: '+0.9',
            LapState: 80,
          },
        },
      ],
    });

    const latest = await tools.get_driver_tracker.execute({
      includeFuture: true,
      driverNumber: '4',
    } as any);

    expect(latest).toEqual({
      asOf: {
        source: 'lap',
        lap: 11,
        dateTime: new Date('2025-01-01T12:02:00Z'),
        includeFuture: true,
      },
      withheld: false,
      sessionPart: 2,
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 1,
      returned: 1,
      rows: [
        {
          lineIndex: 1,
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          showPosition: true,
          lapTime: '1:30.500',
          lapState: 80,
          diffToAhead: null,
          diffToAheadSeconds: null,
          diffToLeader: 'LEADER',
          diffToLeaderSeconds: null,
          overallFastest: null,
          personalFastest: true,
          raw: {
            Position: '1',
            RacingNumber: '4',
            ShowPosition: true,
            DiffToAhead: '',
            DiffToLeader: 'LEADER',
            LapState: 80,
            LapTime: '1:30.500',
            PersonalFastest: true,
          },
        },
      ],
      row: {
        lineIndex: 1,
        driverNumber: '4',
        driverName: 'Lando Norris',
        position: 1,
        showPosition: true,
        lapTime: '1:30.500',
        lapState: 80,
        diffToAhead: null,
        diffToAheadSeconds: null,
        diffToLeader: 'LEADER',
        diffToLeaderSeconds: null,
        overallFastest: null,
        personalFastest: true,
        raw: {
          Position: '1',
          RacingNumber: '4',
          ShowPosition: true,
          DiffToAhead: '',
          DiffToLeader: 'LEADER',
          LapState: 80,
          LapTime: '1:30.500',
          PersonalFastest: true,
        },
      },
    });
  });

  it('get_team_radio_events resolves newest clips with absolute asset URLs and lap context', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: {
            SessionInfo: {
              Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Position: '1' },
              '81': { Position: '2' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [14, 15],
          driversByLap: new Map([
            [
              14,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2024-05-26T12:15:00Z'),
                    NumberOfLaps: 14,
                    Position: '1',
                    GapToLeader: '0',
                    LastLapTime: { Value: '1:33.000' },
                  },
                ],
                [
                  '81',
                  {
                    __dateTime: new Date('2024-05-26T12:15:00Z'),
                    NumberOfLaps: 14,
                    Position: '2',
                    GapToLeader: '+1.200',
                    IntervalToPositionAhead: { Value: '+1.200' },
                    LastLapTime: { Value: '1:33.500' },
                  },
                ],
              ]),
            ],
            [
              15,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2024-05-26T12:16:00Z'),
                    NumberOfLaps: 15,
                    Position: '1',
                    GapToLeader: '0',
                    LastLapTime: { Value: '1:32.800' },
                  },
                ],
                [
                  '81',
                  {
                    __dateTime: new Date('2024-05-26T12:16:00Z'),
                    NumberOfLaps: 15,
                    Position: '2',
                    GapToLeader: '+1.000',
                    IntervalToPositionAhead: { Value: '+1.000' },
                    LastLapTime: { Value: '1:33.100' },
                  },
                ],
              ]),
            ],
          ]),
        },
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4'
              ? 'Lando Norris'
              : driverNumber === '81'
                ? 'Oscar Piastri'
                : null,
        },
        trackStatus: {
          state: { Status: '1', Message: 'AllClear' },
          getAt: () => ({ Status: '1', Message: 'AllClear' }),
        },
        teamRadio: {
          state: {
            Captures: {
              '0': {
                Utc: '2024-05-26T12:15:25.710Z',
                RacingNumber: '81',
                Path: 'TeamRadio/OSCPIA01_81_20240526_121525.mp3',
              },
              '1': {
                Utc: '2024-05-26T12:16:25.710Z',
                RacingNumber: '4',
                Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_team_radio_events.execute({
      limit: 1,
    } as any);

    expect(result).toMatchObject({
      sessionPrefix:
        'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
      total: 2,
      returned: 1,
      captures: [
        {
          captureId: '1',
          driverNumber: '4',
          driverName: 'Lando Norris',
          assetUrl:
            'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/TeamRadio/LANNOR01_4_20240526_121625.mp3',
          context: {
            captureTime: '2024-05-26T12:16:25.710Z',
            matchedTimingTime: '2024-05-26T12:16:00.000Z',
            matchMode: 'at-or-before',
            lap: 15,
            position: 1,
            gapToLeaderSec: 0,
            trackStatus: {
              status: '1',
              message: 'AllClear',
              isGreen: true,
            },
            flags: {
              pit: false,
              pitIn: false,
              pitOut: false,
              inPit: false,
            },
          },
        },
      ],
    });
  });

  it('download_team_radio stores the clip locally and returns file metadata', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('team-radio-audio', { status: 200 }));

    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    const xdgDataHome = mkdtempSync(
      path.join(tmpdir(), 'f1aire-tools-team-radio-'),
    );
    process.env.XDG_DATA_HOME = xdgDataHome;

    try {
      const tools = makeTools({
        store: {
          ...store,
          raw: {
            subscribe: {
              SessionInfo: {
                Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              },
            },
            live: [],
            download: {
              prefix:
                'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              session: {
                path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              },
            },
          },
        } as any,
        processors: {
          ...processors,
          driverList: {
            state: {},
            getName: (driverNumber: string) =>
              driverNumber === '4' ? 'Lando Norris' : null,
          },
          teamRadio: {
            state: {
              Captures: {
                '1': {
                  Utc: '2024-05-26T12:16:25.710Z',
                  RacingNumber: '4',
                  Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
                },
              },
            },
          },
        } as any,
        timeCursor: { latest: true },
        onTimeCursorChange: () => {},
      });

      const result = await tools.download_team_radio.execute({
        captureId: '1',
      } as any);

      expect(result).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        driverName: 'Lando Norris',
        reused: false,
        bytes: 16,
        filePath: path.join(
          xdgDataHome,
          'f1aire',
          'data',
          'team-radio',
          '2024',
          '2024-05-26_Test_Weekend',
          '2024-05-26_Race',
          'LANNOR01_4_20240526_121625.mp3',
        ),
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
      rmSync(xdgDataHome, { recursive: true, force: true });
      if (previousXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previousXdgDataHome;
      }
    }
  });

  it('transcribe_team_radio downloads, transcribes, and reuses cached transcript metadata', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/audio/transcriptions')) {
          expect(
            (init?.headers as Record<string, string> | undefined)
              ?.Authorization,
          ).toBe('Bearer sk-test');
          return new Response(JSON.stringify({ text: 'Box now, box now.' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('team-radio-audio', { status: 200 });
      });

    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    const xdgDataHome = mkdtempSync(
      path.join(tmpdir(), 'f1aire-tools-team-radio-transcribe-'),
    );
    delete process.env.OPENAI_API_KEY;
    process.env.XDG_DATA_HOME = xdgDataHome;

    try {
      const teamRadioState = {
        Captures: {
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };
      const tools = makeTools({
        store: {
          ...store,
          raw: {
            subscribe: {
              SessionInfo: {
                Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              },
            },
            live: [],
            download: {
              prefix:
                'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              session: {
                path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
              },
            },
          },
        } as any,
        processors: {
          ...processors,
          driverList: {
            state: {},
            getName: (driverNumber: string) =>
              driverNumber === '4' ? 'Lando Norris' : null,
          },
          teamRadio: {
            state: teamRadioState,
          },
        } as any,
        timeCursor: { latest: true },
        onTimeCursorChange: () => {},
        resolveOpenAIApiKey: async () => 'sk-test',
      });

      const first = await tools.transcribe_team_radio.execute({
        captureId: '1',
      } as any);

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        driverName: 'Lando Norris',
        reused: false,
        transcriptionReused: false,
        transcription: 'Box now, box now.',
        hasTranscription: true,
      });

      const second = await tools.transcribe_team_radio.execute({
        captureId: '1',
      } as any);

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        transcriptionReused: true,
        transcription: 'Box now, box now.',
        hasTranscription: true,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const events = await tools.get_team_radio_events.execute({
        limit: 1,
      } as any);
      expect(events.captures[0]).toMatchObject({
        captureId: '1',
        downloadedFilePath: first.filePath,
        hasTranscription: true,
      });
    } finally {
      fetchMock.mockRestore();
      rmSync(xdgDataHome, { recursive: true, force: true });
      if (previousXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previousXdgDataHome;
      }
      if (previousOpenAiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      }
    }
  });

  it('get_extrapolated_clock projects remaining time at the current cursor', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        timingData: {
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [10],
          driversByLap: new Map([
            [
              10,
              new Map([
                ['4', { __dateTime: new Date('2025-01-01T12:00:30Z') }],
              ]),
            ],
          ]),
          state: {},
        },
        extrapolatedClock: {
          state: {
            Utc: '2025-01-01T12:00:00Z',
            Remaining: '00:10:00',
            Extrapolating: true,
          },
          getRemainingAt: (dateTime?: Date | null) => {
            const referenceTime = dateTime ?? new Date('2025-01-01T12:00:00Z');
            const elapsedMs = Math.max(
              0,
              referenceTime.getTime() -
                new Date('2025-01-01T12:00:00Z').getTime(),
            );
            return {
              state: {
                Utc: '2025-01-01T12:00:00Z',
                Remaining: '00:10:00',
                Extrapolating: true,
              },
              sourceTime: new Date('2025-01-01T12:00:00Z'),
              referenceTime,
              remainingMs: 600_000 - elapsedMs,
              remainingSeconds: (600_000 - elapsedMs) / 1_000,
              extrapolating: true,
              expired: false,
            };
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_extrapolated_clock.execute({} as any);

    expect(result).toMatchObject({
      asOf: { lap: 10, dateTime: new Date('2025-01-01T12:00:30Z') },
      clock: {
        Utc: '2025-01-01T12:00:00Z',
        Remaining: '00:10:00',
        Extrapolating: true,
      },
      sourceTime: new Date('2025-01-01T12:00:00Z'),
      remainingMs: 570_000,
      remainingSeconds: 570,
      extrapolating: true,
      expired: false,
    });
  });

  it('get_latest returns merged state for auxiliary patch topics', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (name: string) => {
          if (name === 'CurrentTyres') {
            return {
              latest: {
                type: 'CurrentTyres',
                json: { Tyres: { '4': { Compound: 'MEDIUM', New: false } } },
                dateTime: new Date('2025-01-01T00:00:02Z'),
              },
              timeline: () => [],
            };
          }
          return { latest: null, timeline: () => [] };
        },
      } as any,
      processors: {
        ...processors,
        extraTopics: {
          CurrentTyres: {
            state: {
              Tyres: {
                '1': { Compound: 'SOFT', New: true },
                '4': { Compound: 'MEDIUM', New: false },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_latest.execute({
      topic: 'CurrentTyres',
    } as any);

    expect(result).toMatchObject({
      type: 'CurrentTyres',
      json: {
        Tyres: {
          '1': { Compound: 'SOFT', New: true },
          '4': { Compound: 'MEDIUM', New: false },
        },
      },
      dateTime: new Date('2025-01-01T00:00:02Z'),
    });
  });

  it('get_current_tyres returns deterministic tyre state with feed fallback', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {
            Lines: {
              '4': { Line: 1 },
              '81': { Line: 2 },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [14],
          driversByLap: new Map([
            [
              14,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:00:14Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:00:14Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        timingAppData: {
          state: {
            Lines: {
              '4': {
                Stints: {
                  '1': {
                    Compound: 'MEDIUM',
                    New: 'true',
                    StartLaps: 12,
                    TotalLaps: 14,
                  },
                },
              },
            },
          },
        },
        extraTopics: {
          CurrentTyres: {
            state: {
              Tyres: {
                '81': { Compound: 'HARD', New: 'false' },
              },
            },
          },
          TyreStintSeries: {
            state: {
              Stints: {
                '4': {
                  '1': {
                    Compound: 'MEDIUM',
                    New: 'true',
                    TyresNotChanged: '0',
                    StartLaps: 12,
                    TotalLaps: 14,
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.get_current_tyres.execute({} as any)).resolves.toEqual({
      totalDrivers: 2,
      tyres: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 1,
          compound: 'MEDIUM',
          isNew: true,
          tyresNotChanged: false,
          stint: 1,
          startLaps: 12,
          totalLaps: 14,
          lapsOnTyre: 2,
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
  });

  it('get_tyre_stints returns deterministic stint history with TimingAppData fallback', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {
            Lines: {
              '4': { Position: '1' },
              '81': { Position: '2' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [14],
          driversByLap: new Map([
            [
              14,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:00:14Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:00:14Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        timingAppData: {
          state: {
            Lines: {
              '81': {
                Stints: {
                  '0': {
                    Compound: 'HARD',
                    New: 'true',
                    StartLaps: 0,
                    TotalLaps: 10,
                    LapTime: '1:33.000',
                    LapNumber: 10,
                  },
                },
              },
            },
          },
        },
        extraTopics: {
          TyreStintSeries: {
            state: {
              Stints: {
                '4': {
                  '1': {
                    Compound: 'MEDIUM',
                    New: 'true',
                    TyresNotChanged: '0',
                    StartLaps: 12,
                    TotalLaps: 14,
                    LapNumber: 14,
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.get_tyre_stints.execute({} as any)).resolves.toEqual({
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stints: [
            {
              driverNumber: '4',
              driverName: 'Lando Norris',
              stint: 1,
              compound: 'MEDIUM',
              isNew: true,
              tyresNotChanged: false,
              startLaps: 12,
              totalLaps: 14,
              lapsOnTyre: 2,
              lapTime: null,
              lapNumber: 14,
              source: 'TyreStintSeries',
            },
          ],
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          stints: [
            {
              driverNumber: '81',
              driverName: 'Oscar Piastri',
              stint: 0,
              compound: 'HARD',
              isNew: true,
              tyresNotChanged: null,
              startLaps: 0,
              totalLaps: 10,
              lapsOnTyre: 10,
              lapTime: '1:33.000',
              lapNumber: 10,
              source: 'TimingAppData',
            },
          ],
        },
      ],
    });
  });

  it('get_lap_series returns cursor-aware lap position progression', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: { Lines: { '4': { Line: 2 }, '81': { Line: 4 } } },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [1, 2, 3],
          driversByLap: new Map([
            [
              1,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:01:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              2,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 3 },
                ],
              ]),
            ],
            [
              3,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:03:00Z'), Line: 1 },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          LapSeries: {
            state: {
              '4': {
                RacingNumber: '4',
                LapPosition: ['2', '3', '1', '1'],
              },
              '81': {
                RacingNumber: '81',
                LapPosition: ['4', '4', '5', '5'],
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 3 },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_lap_series.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      asOf: {
        source: 'lap',
        lap: 3,
        dateTime: new Date('2025-01-01T00:03:00Z'),
        includeFuture: false,
      },
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 3,
      returned: 3,
      order: 'asc',
      summary: {
        driverNumber: '4',
        totalLaps: 3,
        startLap: 1,
        endLap: 3,
        startPosition: 2,
        endPosition: 1,
        bestPosition: 1,
        worstPosition: 3,
        positionsGained: 1,
        changes: 2,
      },
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          lap: 1,
          position: 2,
          source: 'LapSeries',
        },
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          lap: 2,
          position: 3,
          source: 'LapSeries',
        },
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          lap: 3,
          position: 1,
          source: 'LapSeries',
        },
      ],
    });
  });

  it('get_overtake_series returns cursor-aware typed overtake records', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: { Lines: { '4': { Line: 2 }, '81': { Line: 1 } } },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [1, 2, 3],
          driversByLap: new Map([
            [
              1,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:01:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              2,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 3 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 1 },
                ],
              ]),
            ],
            [
              3,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:03:00Z'), Line: 1 },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          OvertakeSeries: {
            state: {
              Overtakes: {
                '4': {
                  '1': {
                    Timestamp: '2025-01-01T00:01:30Z',
                    count: 1,
                  },
                  '2': {
                    Timestamp: '2025-01-01T00:02:30Z',
                    count: 2,
                  },
                },
                '81': {
                  '1': {
                    Timestamp: '2025-01-01T00:03:30Z',
                    count: 5,
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 2 },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_overtake_series.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      asOf: {
        source: 'lap',
        lap: 2,
        dateTime: new Date('2025-01-01T00:02:00Z'),
        includeFuture: false,
      },
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 1,
      returned: 1,
      order: 'asc',
      summary: {
        driverNumber: '4',
        totalEntries: 1,
        firstTimestamp: '2025-01-01T00:01:30Z',
        lastTimestamp: '2025-01-01T00:01:30Z',
        latestCount: 1,
        minCount: 1,
        maxCount: 1,
        changes: 0,
      },
      records: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          sequence: 1,
          timestamp: '2025-01-01T00:01:30Z',
          dateTime: '2025-01-01T00:01:30.000Z',
          count: 1,
          source: 'OvertakeSeries',
          timingContext: {
            eventTime: '2025-01-01T00:01:30.000Z',
            matchedTimingTime: '2025-01-01T00:01:00.000Z',
            matchMode: 'at-or-before',
            lap: 1,
            position: 2,
            trackStatus: null,
          },
        },
      ],
    });
  });

  it('get_topic_reference shows typed LapSeries examples', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
          },
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : null,
        },
        timingData: {
          state: { Lines: { '4': { Line: 2 } } },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [1, 2, 3],
          driversByLap: new Map([
            [
              1,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:01:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              2,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 3 },
                ],
              ]),
            ],
            [
              3,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:03:00Z'), Line: 1 },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          LapSeries: {
            state: {
              '4': {
                RacingNumber: '4',
                LapPosition: ['2', '3', '1', '1'],
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 3 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'LapSeries',
      driverNumber: '4',
      includeExample: true,
    } as any);

    expect(result).toMatchObject({
      canonicalTopic: 'LapSeries',
      found: true,
      present: true,
      example: {
        asOf: {
          source: 'lap',
          lap: 3,
          dateTime: new Date('2025-01-01T00:03:00Z'),
        },
        driverNumber: '4',
        driverName: 'Lando Norris',
        summary: {
          driverNumber: '4',
          totalLaps: 3,
          startPosition: 2,
          endPosition: 1,
        },
        records: [
          {
            driverNumber: '4',
            driverName: 'Lando Norris',
            lap: 1,
            position: 2,
            source: 'LapSeries',
          },
          {
            driverNumber: '4',
            driverName: 'Lando Norris',
            lap: 2,
            position: 3,
            source: 'LapSeries',
          },
          {
            driverNumber: '4',
            driverName: 'Lando Norris',
            lap: 3,
            position: 1,
            source: 'LapSeries',
          },
        ],
      },
    });
  });

  it('get_topic_reference shows typed OvertakeSeries examples', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
          },
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : null,
        },
        timingData: {
          state: { Lines: { '4': { Line: 1 } } },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [1, 2],
          driversByLap: new Map([
            [
              1,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:01:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              2,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 1 },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          OvertakeSeries: {
            state: {
              Overtakes: {
                '4': {
                  '1': {
                    Timestamp: '2025-01-01T00:01:30Z',
                    count: 1,
                  },
                  '2': {
                    Timestamp: '2025-01-01T00:02:30Z',
                    count: 2,
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'OvertakeSeries',
      driverNumber: '4',
      includeExample: true,
    } as any);

    expect(result).toMatchObject({
      canonicalTopic: 'OvertakeSeries',
      found: true,
      present: true,
      example: {
        asOf: {
          source: 'latest',
          lap: 2,
          dateTime: new Date('2025-01-01T00:02:00Z'),
        },
        driverNumber: '4',
        driverName: 'Lando Norris',
        summary: {
          driverNumber: '4',
          totalEntries: 1,
          latestCount: 1,
        },
        records: [
          {
            driverNumber: '4',
            driverName: 'Lando Norris',
            count: 1,
            source: 'OvertakeSeries',
          },
        ],
      },
    });
  });

  it('get_topic_reference shows typed DriverTracker examples', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (topic: string) => {
          if (topic === 'DriverTracker') {
            return {
              latest: null,
              timeline: (_from?: Date, to?: Date) => {
                const points = [
                  {
                    type: 'DriverTracker',
                    json: {
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
                        },
                      },
                    },
                    dateTime: new Date('2025-01-01T00:01:00Z'),
                  },
                ];
                return points.filter((point) => !to || point.dateTime <= to);
              },
            };
          }

          return {
            latest: null,
            timeline: () => [],
          };
        },
        raw: {
          subscribe: {
            DriverTracker: {
              Withheld: false,
            },
          },
          live: [],
        },
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : null,
        },
        timingData: {
          state: { Lines: { '4': { Line: 2 } } },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [1, 2],
          driversByLap: new Map([
            [
              1,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:01:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              2,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:02:00Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
      } as any,
      timeCursor: { lap: 2 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'DriverTracker',
      driverNumber: '4',
      includeExample: true,
    } as any);

    expect(result).toMatchObject({
      canonicalTopic: 'DriverTracker',
      found: true,
      present: true,
      example: {
        asOf: {
          source: 'lap',
          lap: 2,
          dateTime: new Date('2025-01-01T00:02:00Z'),
        },
        withheld: false,
        sessionPart: null,
        row: {
          lineIndex: 1,
          driverNumber: '4',
          driverName: 'Lando Norris',
          position: 2,
          diffToAhead: '+0.9',
          diffToLeader: '+0.9',
        },
      },
    });
  });

  it('get_pit_stop_events returns cursor-aware pit stop events with tyre context', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {
            Lines: {
              '4': { Position: '1' },
              '81': { Position: '2' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [12, 15],
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:12:00Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:12:00Z'), Line: 2 },
                ],
              ]),
            ],
            [
              15,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:15:00Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:15:00Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        timingAppData: {
          state: {
            Lines: {
              '4': {
                Stints: {
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
          },
        },
        pitStopSeries: {
          state: {
            PitTimes: {
              '4': {
                '0': {
                  Timestamp: '2025-01-01T00:12:30Z',
                  PitStop: {
                    RacingNumber: '4',
                    Lap: '12',
                    PitStopTime: '2.45',
                    PitLaneTime: '22.10',
                  },
                },
                '1': {
                  Timestamp: '2025-01-01T00:15:30Z',
                  PitStop: {
                    RacingNumber: '4',
                    Lap: '15',
                    PitStopTime: '2.60',
                    PitLaneTime: '22.80',
                  },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 12 },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_pit_stop_events.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      asOf: {
        source: 'lap',
        lap: 12,
        dateTime: '2025-01-01T00:12:00.000Z',
      },
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 1,
      events: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          stopNumber: 0,
          lap: 12,
          timestamp: '2025-01-01T00:12:30Z',
          dateTime: '2025-01-01T00:12:30.000Z',
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
            source: 'TimingAppData',
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
            source: 'TimingAppData',
          },
          source: 'PitStopSeries',
        },
      ],
    });
  });

  it('get_lap_snapshot returns deterministic merged state for a lap', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {},
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapSnapshot: (driverNumber: string, lap: number) => {
            if (lap === 12 && driverNumber === '4') {
              return {
                __dateTime: new Date('2025-01-01T00:00:12Z'),
                Line: 1,
                NumberOfLaps: 12,
                BestLapTime: { Value: '1:30.100' },
              };
            }
            return null;
          },
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '81',
                  {
                    __dateTime: new Date('2025-01-01T00:00:12Z'),
                    Line: 2,
                    NumberOfLaps: 12,
                    BestLapTime: { Value: '1:30.200' },
                  },
                ],
                [
                  '4',
                  {
                    __dateTime: new Date('2025-01-01T00:00:12Z'),
                    Line: 1,
                    NumberOfLaps: 12,
                    BestLapTime: { Value: '1:30.100' },
                  },
                ],
              ]),
            ],
          ]),
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_lap_snapshot.execute({ lap: 12 } as any),
    ).resolves.toEqual({
      lap: 12,
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          snapshot: {
            __dateTime: new Date('2025-01-01T00:00:12Z'),
            Line: 1,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.100' },
          },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          snapshot: {
            __dateTime: new Date('2025-01-01T00:00:12Z'),
            Line: 2,
            NumberOfLaps: 12,
            BestLapTime: { Value: '1:30.200' },
          },
        },
      ],
    });

    await expect(
      tools.get_lap_snapshot.execute({ lap: 12, driverNumber: '4' } as any),
    ).resolves.toEqual({
      lap: 12,
      driverNumber: '4',
      driverName: 'Lando Norris',
      snapshot: {
        __dateTime: new Date('2025-01-01T00:00:12Z'),
        Line: 1,
        NumberOfLaps: 12,
        BestLapTime: { Value: '1:30.100' },
      },
    });
  });

  it('get_best_laps returns sorted best-lap records with snapshots', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {},
          getLapHistory: () => [],
          getBestLapSnapshot: (driverNumber: string) => {
            if (driverNumber === '4') {
              return {
                time: '1:30.100',
                timeMs: 90_100,
                lap: 12,
                snapshot: { Line: 1, NumberOfLaps: 12 },
              };
            }
            return null;
          },
          bestLaps: new Map([
            [
              '81',
              {
                time: '1:30.200',
                timeMs: 90_200,
                lap: 12,
                snapshot: { Line: 2, NumberOfLaps: 12 },
              },
            ],
            [
              '4',
              {
                time: '1:30.100',
                timeMs: 90_100,
                lap: 12,
                snapshot: { Line: 1, NumberOfLaps: 12 },
              },
            ],
          ]),
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_best_laps.execute({ includeSnapshot: true } as any),
    ).resolves.toEqual({
      total: 2,
      returned: 2,
      bestLaps: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          time: '1:30.100',
          timeMs: 90_100,
          lap: 12,
          snapshot: { Line: 1, NumberOfLaps: 12 },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          time: '1:30.200',
          timeMs: 90_200,
          lap: 12,
          snapshot: { Line: 2, NumberOfLaps: 12 },
        },
      ],
    });

    await expect(
      tools.get_best_laps.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      driverNumber: '4',
      driverName: 'Lando Norris',
      time: '1:30.100',
      timeMs: 90_100,
      lap: 12,
    });
  });

  it('get_data_book_index returns entries', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const index = await tools.get_data_book_index.execute({} as any);
    expect(Array.isArray(index)).toBe(true);
    expect(index.find((x: any) => x?.topic === 'TimingData')).toBeTruthy();
  });

  it('get_topic_reference returns DataBook info for known topics', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'TimingData',
    } as any);
    expect(result).toMatchObject({
      found: true,
      canonicalTopic: 'TimingData',
      present: true,
    });
    expect(result.reference).toMatchObject({ topic: 'TimingData' });
  });

  it('run_py schema can be converted to JSON schema', () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(() => tools.run_py.inputSchema.toJSONSchema()).not.toThrow();
  });

  it('tool handler rejects run_py from python', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock.mockResolvedValueOnce({
      ok: false,
      error: 'run_py is not callable from Python',
    });

    const result = await tools.run_py.execute({
      code: 'call_tool("run_py")',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/run_py is not callable from Python/i),
    });
  });

  it('returns an error object instead of throwing when python runtime fails', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock.mockResolvedValueOnce({
      ok: false,
      error: 'Traceback (most recent call last):\nRuntimeError: boom',
    });

    const result = await tools.run_py.execute({ code: '1+1' } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/RuntimeError: boom/i),
    });
  });

  it('python tool handler rejects run_py and parses input', async () => {
    makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    expect(capturedToolHandler).toBeTypeOf('function');
    await expect(capturedToolHandler?.('run_py', {})).rejects.toThrow(
      /run_py/i,
    );
    await expect(
      capturedToolHandler?.('get_latest', { topic: 123 }),
    ).rejects.toThrow(/expected string/i);
  });

  it('rejects large vars payloads for run_py', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const bigVars = { payload: 'x'.repeat(9000) };

    const result = await tools.run_py.execute({
      code: '1+1',
      vars: bigVars,
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/vars payload too large/i),
    });
  });

  it('rejects asyncio.run in run_py code', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.run_py.execute({
      code: 'import asyncio\nasyncio.run(main())',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/asyncio\.run/i),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('rejects micropip.install in run_py code', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.run_py.execute({
      code: 'import micropip\nawait micropip.install(\"numpy\")',
    } as any);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringMatching(/micropip\.install/i),
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('passes only vars into the python context (no raw/processors)', async () => {
    const noisyStore = {
      ...store,
      raw: {
        ...store.raw,
        // Real SessionStore.raw contains functions and other non-cloneable values.
        subscribe: () => {},
      },
    } as any;

    const tools = makeTools({
      store: noisyStore,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await tools.run_py.execute({ code: '1+1', vars: { driver: '4' } } as any);

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(runMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: '1+1',
        context: { vars: { driver: '4' } },
      }),
    );
  });

  it('re-initializes and retries once if the worker reports uninitialized', async () => {
    const tools = makeTools({
      store,
      processors,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    runMock
      .mockResolvedValueOnce({ ok: false, error: 'pyodide is not initialized' })
      .mockResolvedValueOnce({ ok: true, value: 2 });

    const result = await tools.run_py.execute({ code: '1+1' } as any);

    expect(result).toEqual({ ok: true, value: 2 });
    expect(initMock).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});
