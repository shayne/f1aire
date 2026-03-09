import path from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    expect(tools).toHaveProperty('get_position_snapshot');
    expect(tools).toHaveProperty('get_position_changes');
    expect(tools).toHaveProperty('get_race_control_events');
    expect(tools).toHaveProperty('get_tla_rcm_events');
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
    expect(tools).toHaveProperty('get_session_lifecycle');
    expect(tools).toHaveProperty('download_team_radio');
    expect(tools).toHaveProperty('transcribe_team_radio');
    expect(tools).toHaveProperty('get_replay_control');
    expect(tools).toHaveProperty('set_time_cursor');
    expect(tools).toHaveProperty('step_time_cursor');
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

  it('returns canonical heartbeat and lap-count snapshots from typed helpers', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        heartbeat: {
          state: {
            UtcTime: '2025-03-09T12:34:56Z',
          },
        },
        lapCount: {
          state: {
            CurrentLap: '12',
            TotalLaps: '57',
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.get_heartbeat.execute({} as any)).resolves.toEqual({
      utc: '2025-03-09T12:34:56.000Z',
    });
    await expect(tools.get_lap_count.execute({} as any)).resolves.toEqual({
      currentLap: 12,
      totalLaps: 57,
      lapsRemaining: 45,
    });
  });

  it('get_session_info returns derived static prefix and session-type flags', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        sessionInfo: {
          state: {
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
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.get_session_info.execute({} as any)).resolves.toEqual({
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

  it('get_session_lifecycle returns typed cursor-aware lifecycle state', async () => {
    const sessionDataPoints = [
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '1': {
              Utc: '2024-07-05T11:30:01.009Z',
              SessionStatus: 'Started',
            },
          },
        },
        dateTime: new Date('2024-07-05T11:30:01.009Z'),
      },
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '2': {
              Utc: '2024-07-05T11:34:24.114Z',
              TrackStatus: 'Yellow',
            },
          },
        },
        dateTime: new Date('2024-07-05T11:34:24.114Z'),
      },
      {
        type: 'SessionData',
        json: {
          StatusSeries: {
            '3': {
              Utc: '2024-07-05T11:38:50.337Z',
              SessionStatus: 'Aborted',
            },
          },
        },
        dateTime: new Date('2024-07-05T11:38:50.337Z'),
      },
      {
        type: 'SessionStatus',
        json: {
          Utc: '2024-07-05T11:46:00.078Z',
          Status: 'Started',
        },
        dateTime: new Date('2024-07-05T11:46:00.078Z'),
      },
    ];

    const customStore = {
      raw: {
        subscribe: {
          SessionInfo: {
            SessionStatus: 'Inactive',
            ArchiveStatus: { Status: 'Generating' },
          },
          SessionData: {
            StatusSeries: [
              {
                Utc: '2024-07-05T11:04:27.057Z',
                TrackStatus: 'AllClear',
              },
            ],
          },
        },
        live: sessionDataPoints,
      },
      topic: (name: string) => {
        const items = sessionDataPoints.filter((point) => point.type === name);
        return {
          latest: items.at(-1) ?? null,
          timeline: (_from?: Date, to?: Date) =>
            items.filter((point) => !to || point.dateTime <= to),
        };
      },
    } as any;

    const tools = makeTools({
      store: customStore,
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
                    __dateTime: new Date('2024-07-05T11:35:00.000Z'),
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
                    __dateTime: new Date('2024-07-05T11:47:00.000Z'),
                    NumberOfLaps: 15,
                    Position: '1',
                  },
                ],
              ]),
            ],
          ]),
        },
        sessionInfo: {
          state: customStore.raw.subscribe.SessionInfo,
        },
        sessionData: {
          state: {
            StatusSeries: {
              '0': {
                Utc: '2024-07-05T11:04:27.057Z',
                TrackStatus: 'AllClear',
              },
              '1': {
                Utc: '2024-07-05T11:30:01.009Z',
                SessionStatus: 'Started',
              },
              '2': {
                Utc: '2024-07-05T11:34:24.114Z',
                TrackStatus: 'Yellow',
              },
              '3': {
                Utc: '2024-07-05T11:38:50.337Z',
                SessionStatus: 'Aborted',
              },
            },
          },
        },
      } as any,
      timeCursor: { lap: 14 },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_session_lifecycle.execute({} as any);

    expect(result).toEqual({
      asOf: {
        source: 'lap',
        lap: 14,
        dateTime: new Date('2024-07-05T11:35:00.000Z'),
        includeFuture: false,
      },
      sessionStatus: {
        status: 'Started',
        utc: '2024-07-05T11:30:01.009Z',
        source: 'SessionData',
      },
      trackStatus: {
        status: 'Yellow',
        utc: '2024-07-05T11:34:24.114Z',
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
          utc: '2024-07-05T11:04:27.057Z',
          sessionStatus: null,
          trackStatus: 'AllClear',
          source: 'SessionData',
        },
        {
          eventId: '1',
          utc: '2024-07-05T11:30:01.009Z',
          sessionStatus: 'Started',
          trackStatus: null,
          source: 'SessionData',
        },
        {
          eventId: '2',
          utc: '2024-07-05T11:34:24.114Z',
          sessionStatus: null,
          trackStatus: 'Yellow',
          source: 'SessionData',
        },
      ],
    });
  });

  it('get_topic_reference shows typed lifecycle examples for SessionStatus', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: {
            SessionInfo: {
              SessionStatus: 'Inactive',
              ArchiveStatus: { Status: 'Generating' },
            },
          },
          live: [],
        },
        topic: () => ({ latest: null, timeline: () => [] }),
      } as any,
      processors: {
        ...processors,
        sessionInfo: {
          state: {
            SessionStatus: 'Inactive',
            ArchiveStatus: { Status: 'Generating' },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_topic_reference.execute({
      topic: 'SessionStatus',
      includeExample: true,
    } as any);

    expect(result).toMatchObject({
      canonicalTopic: 'SessionStatus',
      found: true,
      present: true,
      example: {
        sessionStatus: {
          status: 'Inactive',
          source: 'SessionInfo',
        },
        archiveStatus: {
          status: 'Generating',
          source: 'SessionInfo',
        },
        recentEvents: [
          {
            sessionStatus: 'Inactive',
            source: 'SessionInfo',
          },
        ],
      },
    });
  });

  it('get_topic_reference shows typed CarData and Position examples', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {},
          getName: (driverNumber: string) =>
            driverNumber === '81' ? 'Oscar Piastri' : 'Lando Norris',
        },
        carData: {
          state: {
            Entries: [
              {
                Utc: '2025-01-01T00:00:02Z',
                Cars: {
                  '81': { Channels: { '0': '12000', '2': '305', '45': '8' } },
                },
              },
            ],
          },
        },
        position: {
          state: {
            Position: [
              {
                Timestamp: '2025-01-01T00:00:03Z',
                Entries: {
                  '81': { Status: 'OnTrack', X: '10', Y: 20, Z: '30' },
                },
              },
            ],
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const carData = await tools.get_topic_reference.execute({
      topic: 'CarData',
      driverNumber: '81',
      includeExample: true,
    } as any);

    expect(carData).toMatchObject({
      canonicalTopic: 'CarData',
      example: {
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        channels: {
          rpm: 12000,
          speed: 305,
          drs: 8,
        },
      },
    });

    const position = await tools.get_topic_reference.execute({
      topic: 'Position',
      driverNumber: '81',
      includeExample: true,
    } as any);

    expect(position).toMatchObject({
      canonicalTopic: 'Position',
      example: {
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        entry: {
          status: 'OnTrack',
          x: 10,
          y: 20,
          z: 30,
        },
      },
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

  it('get_tla_rcm_events returns typed ticker events filtered by the current cursor', async () => {
    const tlaPoints = [
      {
        type: 'TlaRcm',
        json: {
          Timestamp: '2026-03-07T16:00:00',
          Message: 'GREEN LIGHT - PIT EXIT OPEN',
        },
        dateTime: new Date('2026-03-07T05:00:02.740Z'),
      },
      {
        type: 'TlaRcm',
        json: {
          Timestamp: '2026-03-07T16:04:02',
          Message:
            'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
        },
        dateTime: new Date('2026-03-07T05:04:04.328Z'),
      },
      {
        type: 'TlaRcm',
        json: {
          Timestamp: '2026-03-07T16:10:31',
          Message: 'RED FLAG',
        },
        dateTime: new Date('2026-03-07T05:10:33.959Z'),
      },
    ];

    const customStore = {
      raw: {
        subscribe: {},
        live: tlaPoints,
      },
      topic: (name: string) => {
        const items = tlaPoints.filter((point) => point.type === name);
        return {
          latest: items.at(-1) ?? null,
          timeline: (_from?: Date, to?: Date) =>
            items.filter((point) => !to || point.dateTime <= to),
        };
      },
    } as any;

    const tools = makeTools({
      store: customStore,
      processors: {
        ...processors,
        driverList: {
          state: { '43': { FullName: 'Franco Colapinto' } },
          getName: (driverNumber: string) =>
            driverNumber === '43' ? 'Franco Colapinto' : null,
        },
        timingData: {
          state: {
            Lines: {
              '43': { Position: '18' },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [3],
          driversByLap: new Map([
            [
              3,
              new Map([
                [
                  '43',
                  {
                    __dateTime: new Date('2026-03-07T05:05:00.000Z'),
                    NumberOfLaps: 3,
                    Position: '18',
                  },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          TlaRcm: {
            state: tlaPoints.at(-1)?.json,
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    const result = await tools.get_tla_rcm_events.execute({
      order: 'asc',
    } as any);

    expect(result).toEqual({
      asOf: {
        source: 'latest',
        lap: 3,
        dateTime: new Date('2026-03-07T05:05:00.000Z'),
        includeFuture: false,
      },
      total: 2,
      returned: 2,
      order: 'asc',
      summary: {
        total: 2,
        byCategory: {
          'track-status': 0,
          'track-limits': 1,
          investigation: 0,
          'pit-lane': 1,
          'session-control': 0,
          drs: 0,
          other: 0,
        },
        driverCount: 1,
        sectors: [],
      },
      events: [
        {
          eventId: '0',
          timestamp: '2026-03-07T16:00:00',
          dateTime: '2026-03-07T05:00:02.740Z',
          message: 'GREEN LIGHT - PIT EXIT OPEN',
          category: 'pit-lane',
          driverNumber: null,
          driverName: null,
          lap: null,
          sector: null,
          pit: true,
          raw: {
            Timestamp: '2026-03-07T16:00:00',
            Message: 'GREEN LIGHT - PIT EXIT OPEN',
          },
        },
        {
          eventId: '1',
          timestamp: '2026-03-07T16:04:02',
          dateTime: '2026-03-07T05:04:04.328Z',
          message:
            'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
          category: 'track-limits',
          driverNumber: '43',
          driverName: 'Franco Colapinto',
          lap: 3,
          sector: null,
          pit: false,
          raw: {
            Timestamp: '2026-03-07T16:04:02',
            Message:
              'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
          },
        },
      ],
    });

    await expect(
      tools.get_tla_rcm_events.execute({
        category: 'track-limits',
        driverNumber: '43',
      } as any),
    ).resolves.toMatchObject({
      total: 1,
      returned: 1,
      events: [
        {
          category: 'track-limits',
          driverNumber: '43',
          driverName: 'Franco Colapinto',
          lap: 3,
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

  it('get_weather returns the latest typed weather snapshot', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        weatherData: {
          state: {
            Timestamp: '2026-03-07T04:50:11.926Z',
            AirTemp: '20.4',
            Humidity: '67.7',
            Pressure: '1013.7',
            Rainfall: '1',
            TrackTemp: '36.9',
            WindDirection: '94',
            WindSpeed: '2.7',
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.get_weather.execute({} as any)).resolves.toEqual({
      timestamp: '2026-03-07T04:50:11.926Z',
      airTempC: 20.4,
      humidityPct: 67.7,
      pressureHpa: 1013.7,
      rainfall: 1,
      trackTempC: 36.9,
      windDirectionDeg: 94,
      windSpeed: 2.7,
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
        backend: 'openai',
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
        backend: 'openai',
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

  it('transcribe_team_radio supports the local backend', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('team-radio-audio', { status: 200 }));
    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    const xdgDataHome = mkdtempSync(
      path.join(tmpdir(), 'f1aire-tools-team-radio-local-'),
    );
    process.env.XDG_DATA_HOME = xdgDataHome;
    const execFileImpl = (file, args, _options, callback) => {
      expect(file).toBe('whisper');
      const inputPath = String(args[0]);
      const outputDir = String(args[args.indexOf('--output_dir') + 1]);
      writeFileSync(
        path.join(outputDir, `${path.parse(inputPath).name}.json`),
        JSON.stringify({ text: 'Local engineer copy.' }),
      );
      callback?.(null, '', '');
      return {} as any;
    };

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
        resolveOpenAIApiKey: async () => null,
        teamRadioExecFileImpl: execFileImpl,
      });

      const result = await tools.transcribe_team_radio.execute({
        captureId: '1',
        backend: 'local',
      } as any);

      expect(result).toMatchObject({
        captureId: '1',
        driverName: 'Lando Norris',
        backend: 'local',
        transcription: 'Local engineer copy.',
        transcriptionReused: false,
        model: 'base',
      });
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

  it('get_timing_stats returns deterministic trap tables and per-driver best speeds', async () => {
    const tools = makeTools({
      store,
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
        timingStats: {
          state: {
            Lines: {
              '4': {
                BestSpeeds: {
                  FL: { Value: '338.5', Position: 2 },
                  ST: { Value: '319.0', Position: 2 },
                },
              },
              '81': {
                BestSpeeds: {
                  FL: { Value: '340.0', Position: 1 },
                  ST: { Value: '320.1', Position: 1 },
                },
              },
            },
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_timing_stats.execute({ trap: 'fl' } as any),
    ).resolves.toMatchObject({
      trap: 'FL',
      totalDrivers: 2,
      fastest: {
        driverNumber: '81',
        driverName: 'Oscar Piastri',
        speedKph: 340,
      },
      records: [
        { driverNumber: '81', position: 1 },
        { driverNumber: '4', position: 2 },
      ],
    });

    await expect(
      tools.get_timing_stats.execute({ driverNumber: '4' } as any),
    ).resolves.toMatchObject({
      driverNumber: '4',
      driverName: 'Lando Norris',
      bestSpeeds: [
        { trap: 'FL', position: 2, speedKph: 338.5 },
        { trap: 'ST', position: 2, speedKph: 319 },
      ],
    });
  });

  it('get_championship_prediction returns deterministic driver and team tables', async () => {
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          ...store.raw,
          subscribe: {
            ChampionshipPrediction: {
              Drivers: {
                '1': {
                  RacingNumber: '1',
                  CurrentPosition: 1,
                  PredictedPosition: 1,
                  CurrentPoints: 100,
                  PredictedPoints: 108,
                },
                '4': {
                  RacingNumber: '4',
                  CurrentPosition: 2,
                  PredictedPosition: 2,
                  CurrentPoints: 95,
                  PredictedPoints: 101,
                },
              },
              Teams: {
                'Red Bull Racing': {
                  TeamName: 'Red Bull Racing',
                  CurrentPosition: 1,
                  PredictedPosition: 1,
                  CurrentPoints: 180,
                  PredictedPoints: 188,
                },
                'McLaren Mercedes': {
                  TeamName: 'McLaren Mercedes',
                  CurrentPosition: 2,
                  PredictedPosition: 2,
                  CurrentPoints: 170,
                  PredictedPoints: 181,
                },
              },
            },
          },
        },
        topic: (name: string) => ({
          latest: null,
          timeline: () =>
            name === 'ChampionshipPrediction'
              ? [
                  {
                    type: 'ChampionshipPrediction',
                    json: {
                      Drivers: {
                        '4': {
                          PredictedPosition: 1,
                          PredictedPoints: 109,
                        },
                      },
                      Teams: {
                        'McLaren Mercedes': {
                          PredictedPosition: 1,
                          PredictedPoints: 190,
                        },
                      },
                    },
                    dateTime: new Date('2025-01-01T12:00:00Z'),
                  },
                ]
              : [],
        }),
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: {
            '1': { FullName: 'Max Verstappen', TeamName: 'Red Bull Racing' },
            '4': { FullName: 'Lando Norris', TeamName: 'McLaren Mercedes' },
          },
          getName: (driverNumber: string) =>
            driverNumber === '1'
              ? 'Max Verstappen'
              : driverNumber === '4'
                ? 'Lando Norris'
                : null,
        },
        championshipPrediction: {
          state: {
            Drivers: {},
            Teams: {},
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_championship_prediction.execute({
        teamName: 'McLaren',
      } as any),
    ).resolves.toMatchObject({
      asOf: {
        includeFuture: false,
      },
      totalDrivers: 2,
      totalTeams: 2,
      returnedDrivers: 1,
      returnedTeams: 1,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          teamName: 'McLaren Mercedes',
          predictedPosition: 1,
          positionsGained: 1,
          pointsDelta: 14,
          gapToLeaderPoints: 0,
        },
      ],
      teams: [
        {
          teamName: 'McLaren Mercedes',
          predictedPosition: 1,
          positionsGained: 1,
          pointsDelta: 20,
          gapToLeaderPoints: 0,
        },
      ],
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

  it('get_position_snapshot returns merged position + telemetry state', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
            '81': { BroadcastName: 'Oscar Piastri' },
          },
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
          getLapNumbers: () => [12],
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:00:12Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:00:12Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        position: {
          state: {
            Position: [
              {
                Timestamp: '2025-01-01T00:00:12.000Z',
                Entries: {
                  '4': { Status: 'OnTrack', X: '10', Y: 20, Z: '30' },
                  '81': { Status: 'OffTrack', X: 40, Y: '50', Z: 60 },
                },
              },
            ],
          },
        },
        carData: {
          state: {
            Entries: [
              {
                Utc: '2025-01-01T00:00:12.100Z',
                Cars: {
                  '4': { Channels: { '2': '302', '3': '8', '45': '10' } },
                  '81': { Channels: { '2': 120, '3': '3', '45': '8' } },
                },
              },
            ],
          },
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_position_snapshot.execute({} as any),
    ).resolves.toEqual({
      asOf: {
        source: 'latest',
        lap: 12,
        dateTime: new Date('2025-01-01T00:00:12.000Z'),
      },
      positionTimestamp: '2025-01-01T00:00:12.000Z',
      telemetryUtc: '2025-01-01T00:00:12.100Z',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 1,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 10, y: 20, z: 30 },
          telemetry: {
            rpm: null,
            speed: 302,
            gear: 8,
            throttle: null,
            brake: null,
            drs: 10,
          },
        },
        {
          driverNumber: '81',
          driverName: 'Oscar Piastri',
          timingPosition: 2,
          status: 'OffTrack',
          offTrack: true,
          coordinates: { x: 40, y: 50, z: 60 },
          telemetry: {
            rpm: null,
            speed: 120,
            gear: 3,
            throttle: null,
            brake: null,
            drs: 8,
          },
        },
      ],
    });
  });

  it('get_position_snapshot respects historical replay cursor', async () => {
    const tools = makeTools({
      store: {
        ...store,
        topic: (name: string) => ({
          latest: null,
          timeline: () => {
            if (name === 'Position') {
              return [
                {
                  type: 'Position',
                  json: {
                    Position: [
                      {
                        Timestamp: '2025-01-01T00:00:11.000Z',
                        Entries: {
                          '4': { Status: 'OnTrack', X: 1, Y: 2, Z: 3 },
                        },
                      },
                    ],
                  },
                  dateTime: new Date('2025-01-01T00:00:11.000Z'),
                },
              ];
            }
            if (name === 'CarData') {
              return [
                {
                  type: 'CarData',
                  json: {
                    Entries: [
                      {
                        Utc: '2025-01-01T00:00:11.100Z',
                        Cars: {
                          '4': {
                            Channels: { '2': '300', '3': '7', '45': '10' },
                          },
                        },
                      },
                    ],
                  },
                  dateTime: new Date('2025-01-01T00:00:11.100Z'),
                },
              ];
            }
            return [];
          },
        }),
        raw: { subscribe: {}, live: [] },
      } as any,
      processors: {
        ...processors,
        driverList: {
          state: { '4': { FullName: 'Lando Norris' } },
          getName: () => 'Lando Norris',
        },
        timingData: {
          state: {
            Lines: {
              '4': { Line: 2 },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [11, 12],
          driversByLap: new Map([
            [
              11,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:00:11Z'), Line: 1 },
                ],
              ]),
            ],
            [
              12,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:00:12Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        position: { state: null },
        carData: { state: null },
      } as any,
      timeCursor: { lap: 11 },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_position_snapshot.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      driverNumber: '4',
      driverName: 'Lando Norris',
      timingPosition: 1,
      status: 'OnTrack',
      offTrack: false,
      coordinates: { x: 1, y: 2, z: 3 },
      telemetry: {
        rpm: null,
        speed: 300,
        gear: 7,
        throttle: null,
        brake: null,
        drs: 10,
      },
    });
  });

  it('get_position_snapshot reconstructs exact-time snapshots inside the latest lap', async () => {
    const exactTimePoints = [
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
    const byTopic = new Map<string, any[]>();
    for (const point of exactTimePoints) {
      const items = byTopic.get(point.type) ?? [];
      items.push(point);
      byTopic.set(point.type, items);
    }
    for (const items of byTopic.values()) {
      items.sort(
        (left, right) => left.dateTime.getTime() - right.dateTime.getTime(),
      );
    }

    const tools = makeTools({
      store: {
        raw: { subscribe: {}, live: exactTimePoints },
        topic: (name: string) => {
          const items = byTopic.get(name) ?? [];
          return {
            latest: items.at(-1) ?? null,
            timeline: (from?: Date, to?: Date) =>
              items.filter(
                (point) =>
                  (!from || point.dateTime >= from) &&
                  (!to || point.dateTime <= to),
              ),
          };
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
            driverNumber === '4' ? 'Lando Norris' : 'Oscar Piastri',
        },
        timingData: {
          state: {
            Lines: {
              '4': { Line: 2 },
              '81': { Line: 1 },
            },
          },
          bestLaps: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [12],
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '4',
                  {
                    __dateTime: new Date('2025-01-01T00:00:12.000Z'),
                    Line: 2,
                  },
                ],
                [
                  '81',
                  {
                    __dateTime: new Date('2025-01-01T00:00:12.000Z'),
                    Line: 1,
                  },
                ],
              ]),
            ],
          ]),
        },
        position: {
          state: exactTimePoints[4].json,
        },
        carData: {
          state: exactTimePoints[5].json,
        },
      } as any,
      timeCursor: { iso: '2025-01-01T00:00:12.300Z' },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_position_snapshot.execute({} as any),
    ).resolves.toEqual({
      asOf: {
        source: 'time',
        lap: 12,
        dateTime: new Date('2025-01-01T00:00:12.300Z'),
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

  it('get_current_tyres and get_tyre_stints respect historical replay cursor', async () => {
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
          getLapNumbers: () => [12, 13],
          driversByLap: new Map([
            [
              12,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:12:00Z'), Line: 2 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:12:00Z'), Line: 1 },
                ],
              ]),
            ],
            [
              13,
              new Map([
                [
                  '4',
                  { __dateTime: new Date('2025-01-01T00:13:00Z'), Line: 1 },
                ],
                [
                  '81',
                  { __dateTime: new Date('2025-01-01T00:13:00Z'), Line: 2 },
                ],
              ]),
            ],
          ]),
        },
        extraTopics: {
          CurrentTyres: {
            state: {
              Tyres: {
                '4': { Compound: 'HARD', New: 'false' },
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
      } as any,
      timeCursor: { lap: 12 },
      onTimeCursorChange: () => {},
    });

    await expect(
      tools.get_current_tyres.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      driverNumber: '4',
      driverName: 'Lando Norris',
      position: 2,
      compound: 'MEDIUM',
      isNew: true,
      tyresNotChanged: null,
      stint: 1,
      startLaps: 1,
      totalLaps: 12,
      lapsOnTyre: 11,
      source: 'TyreStintSeries',
    });

    await expect(
      tools.get_tyre_stints.execute({ driverNumber: '4' } as any),
    ).resolves.toEqual({
      driverNumber: '4',
      driverName: 'Lando Norris',
      total: 1,
      stints: [
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

  it('get_replay_control returns resolved cursor state and lap range', async () => {
    const onTimeCursorChange = vi.fn();
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: { SessionInfo: { Name: 'Replay Test' } },
          live: [
            {
              type: 'TimingData',
              json: {},
              dateTime: new Date('2025-01-01T00:00:10Z'),
            },
          ],
        },
      } as any,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Line: 1, NumberOfLaps: 11 },
              '81': { Line: 2, NumberOfLaps: 11 },
            },
          },
          bestLaps: new Map(),
          driversByLap: new Map([
            [
              11,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 11,
                    __dateTime: new Date('2025-01-01T00:00:11Z'),
                  },
                ],
                [
                  '81',
                  {
                    Line: 2,
                    NumberOfLaps: 11,
                    __dateTime: new Date('2025-01-01T00:00:12Z'),
                  },
                ],
              ]),
            ],
            [
              12,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 12,
                    __dateTime: new Date('2025-01-01T00:00:21Z'),
                  },
                ],
                [
                  '81',
                  {
                    Line: 2,
                    NumberOfLaps: 12,
                    __dateTime: new Date('2025-01-01T00:00:22Z'),
                  },
                ],
              ]),
            ],
          ]),
          getLapHistory: () => [],
          getLapNumbers: () => [11, 12],
        },
        driverList: {
          state: {
            '4': { FullName: 'Lando Norris' },
            '81': { FullName: 'Oscar Piastri' },
          },
          getName: (driverNumber: string) =>
            ({ '4': 'Lando Norris', '81': 'Oscar Piastri' })[driverNumber] ??
            null,
        },
        sessionInfo: {
          state: {
            Name: 'Race',
            Meeting: { Name: 'Replay GP' },
          },
        },
      } as any,
      timeCursor: { lap: 11 },
      onTimeCursorChange,
    });

    await expect(
      tools.get_replay_control.execute({} as any),
    ).resolves.toMatchObject({
      sessionLoaded: true,
      sessionName: 'Race',
      cursor: { lap: 11 },
      resolved: {
        lap: 11,
        source: 'lap',
        dateTime: '2025-01-01T00:00:11.000Z',
      },
      lapRange: {
        firstLap: 11,
        lastLap: 12,
        totalLaps: 2,
      },
    });
    expect(onTimeCursorChange).not.toHaveBeenCalled();
  });

  it('step_time_cursor advances and rewinds the replay cursor via control primitives', async () => {
    const onTimeCursorChange = vi.fn();
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: { SessionInfo: { Name: 'Replay Test' } },
          live: [
            {
              type: 'TimingData',
              json: {},
              dateTime: new Date('2025-01-01T00:00:10Z'),
            },
          ],
        },
      } as any,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Line: 1, NumberOfLaps: 11 },
            },
          },
          bestLaps: new Map(),
          driversByLap: new Map([
            [
              11,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 11,
                    __dateTime: new Date('2025-01-01T00:00:11Z'),
                  },
                ],
              ]),
            ],
            [
              12,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 12,
                    __dateTime: new Date('2025-01-01T00:00:21Z'),
                  },
                ],
              ]),
            ],
            [
              13,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 13,
                    __dateTime: new Date('2025-01-01T00:00:31Z'),
                  },
                ],
              ]),
            ],
          ]),
          getLapHistory: () => [],
          getLapNumbers: () => [11, 12, 13],
        },
        driverList: {
          state: { '4': { FullName: 'Lando Norris' } },
          getName: () => 'Lando Norris',
        },
      } as any,
      timeCursor: { lap: 12 },
      onTimeCursorChange,
    });

    await expect(
      tools.step_time_cursor.execute({ delta: 1 } as any),
    ).resolves.toEqual({
      ok: true,
      value: {
        sessionLoaded: true,
        sessionName: null,
        cursor: { lap: 13 },
        resolved: {
          lap: 13,
          source: 'lap',
          dateTime: '2025-01-01T00:00:31.000Z',
        },
        lapRange: {
          firstLap: 11,
          lastLap: 13,
          totalLaps: 3,
        },
      },
    });

    await expect(
      tools.step_time_cursor.execute({ delta: -5 } as any),
    ).resolves.toEqual({
      ok: true,
      value: {
        sessionLoaded: true,
        sessionName: null,
        cursor: { lap: 11 },
        resolved: {
          lap: 11,
          source: 'lap',
          dateTime: '2025-01-01T00:00:11.000Z',
        },
        lapRange: {
          firstLap: 11,
          lastLap: 13,
          totalLaps: 3,
        },
      },
    });

    expect(onTimeCursorChange).toHaveBeenNthCalledWith(1, { lap: 13 });
    expect(onTimeCursorChange).toHaveBeenNthCalledWith(2, { lap: 11 });
  });

  it('step_time_cursor supports time-based stepping via replay control primitives', async () => {
    const onTimeCursorChange = vi.fn();
    const tools = makeTools({
      store: {
        ...store,
        raw: {
          subscribe: { SessionInfo: { Name: 'Replay Test' } },
          live: [
            {
              type: 'TimingData',
              json: {},
              dateTime: new Date('2025-01-01T00:00:10Z'),
            },
          ],
        },
      } as any,
      processors: {
        ...processors,
        timingData: {
          state: {
            Lines: {
              '4': { Line: 1, NumberOfLaps: 11 },
            },
          },
          bestLaps: new Map(),
          driversByLap: new Map([
            [
              11,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 11,
                    __dateTime: new Date('2025-01-01T00:00:11Z'),
                  },
                ],
              ]),
            ],
            [
              12,
              new Map([
                [
                  '4',
                  {
                    Line: 1,
                    NumberOfLaps: 12,
                    __dateTime: new Date('2025-01-01T00:00:12Z'),
                  },
                ],
              ]),
            ],
          ]),
          getLapHistory: () => [],
          getLapNumbers: () => [11, 12],
        },
        driverList: {
          state: { '4': { FullName: 'Lando Norris' } },
          getName: () => 'Lando Norris',
        },
      } as any,
      timeCursor: { iso: '2025-01-01T00:00:11.700Z' },
      onTimeCursorChange,
    });

    await expect(
      tools.step_time_cursor.execute({ deltaMs: 100 } as any),
    ).resolves.toEqual({
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
          source: 'time',
          dateTime: '2025-01-01T00:00:12.000Z',
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

  it('step_time_cursor returns a structured no-laps error when replay data is unavailable', async () => {
    const tools = makeTools({
      store,
      processors: {
        ...processors,
        timingData: {
          state: { Lines: {} },
          bestLaps: new Map(),
          driversByLap: new Map(),
          getLapHistory: () => [],
          getLapNumbers: () => [],
        },
      } as any,
      timeCursor: { latest: true },
      onTimeCursorChange: () => {},
    });

    await expect(tools.step_time_cursor.execute({} as any)).resolves.toEqual({
      ok: false,
      error: {
        errorCode: 'no-laps',
        errorMessage: 'No lap snapshots are available for replay control.',
      },
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
