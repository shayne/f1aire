import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import {
  hydrateTimingServiceFromStore,
  TimingService,
} from './timing-service.js';

function buildStore(raw: {
  subscribe: Record<string, unknown>;
  live: Array<{ type: string; json: unknown; dateTime: Date }>;
  keyframes: Record<string, unknown> | null;
}) {
  return {
    raw: {
      subscribe: raw.subscribe,
      live: raw.live,
      download: null,
      keyframes: raw.keyframes,
    },
    topic: () => ({ latest: null, timeline: () => [] }),
  } as const;
}

describe('hydrateTimingServiceFromStore', () => {
  it('hydrates compressed subscription feeds before canonicalizing topic names', () => {
    const service = new TimingService();
    const carData = deflateRawSync(
      Buffer.from(
        JSON.stringify({
          Entries: [
            {
              Utc: '2025-03-01T10:00:00Z',
              Cars: {
                '4': {
                  Channels: { '0': 12100, '2': 314 },
                },
              },
            },
          ],
        }),
      ),
    ).toString('base64');
    const position = deflateRawSync(
      Buffer.from(
        JSON.stringify({
          Position: [
            {
              Timestamp: '2025-03-01T10:00:00Z',
              Entries: {
                '4': { Status: 'OnTrack', X: 1.5, Y: 2.5, Z: 0 },
              },
            },
          ],
        }),
      ),
    ).toString('base64');
    const store = buildStore({
      subscribe: {
        SessionInfo: {
          Name: 'Race',
          Path: '2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
        },
        Heartbeat: {
          Utc: '2025-03-01T10:00:00Z',
        },
        'CarData.z': carData,
        'Position.z': position,
      },
      live: [],
      keyframes: null,
    });

    const result = hydrateTimingServiceFromStore({ service, store });

    expect(result).toEqual({
      subscribeTopics: ['SessionInfo', 'Heartbeat', 'CarData', 'Position'],
      keyframeTopics: [],
      livePoints: 0,
    });
    expect(service.processors.carData.state).toEqual({
      Entries: [
        {
          Utc: '2025-03-01T10:00:00Z',
          Cars: {
            '4': {
              Channels: { '0': 12100, '2': 314 },
            },
          },
        },
      ],
    });
    expect(service.processors.position.state).toEqual({
      Position: [
        {
          Entries: {
            '4': { Status: 'OnTrack', X: 1.5, Y: 2.5, Z: 0 },
          },
          Timestamp: '2025-03-01T10:00:00Z',
        },
      ],
    });
  });

  it('hydrates keyframe-only feeds into processors when the live stream is missing', () => {
    const service = new TimingService();
    const store = buildStore({
      subscribe: {
        SessionInfo: {
          Name: 'Race',
          Path: '2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
        },
        Heartbeat: {
          Utc: '2025-03-01T10:00:00Z',
        },
      },
      live: [],
      keyframes: {
        AudioStreams: {
          Streams: [
            {
              Name: 'FX',
              Language: 'en',
              Path: 'AudioStreams/FX.m3u8',
            },
          ],
        },
      },
    });

    const result = hydrateTimingServiceFromStore({ service, store });

    expect(result).toEqual({
      subscribeTopics: ['SessionInfo', 'Heartbeat'],
      keyframeTopics: ['AudioStreams'],
      livePoints: 0,
    });
    expect(service.processors.extraTopics.AudioStreams.state).toEqual({
      Streams: {
        '0': {
          Name: 'FX',
          Language: 'en',
          Path: 'AudioStreams/FX.m3u8',
        },
      },
    });
  });

  it('does not hydrate a keyframe when live updates already exist for that topic', () => {
    const service = new TimingService();
    const store = buildStore({
      subscribe: {
        SessionInfo: {
          Name: 'Race',
          Path: '2025/2025-03-01_Test_Weekend/2025-03-01_Race/',
        },
        Heartbeat: {
          Utc: '2025-03-01T10:00:00Z',
        },
      },
      live: [
        {
          type: 'TimingData',
          json: {
            Lines: {
              '4': {
                Line: 1,
                NumberOfLaps: 12,
                BestLapTime: { Value: '1:30.000', Lap: 12 },
                LastLapTime: { Value: '1:30.000' },
              },
            },
          },
          dateTime: new Date('2025-03-01T10:12:00Z'),
        },
      ],
      keyframes: {
        AudioStreams: {
          Streams: [
            {
              Name: 'FX',
              Language: 'en',
              Path: 'AudioStreams/FX.m3u8',
            },
          ],
        },
        TimingData: {
          Lines: {
            '4': {
              Line: 99,
              NumberOfLaps: 1,
              BestLapTime: { Value: '1:40.000', Lap: 1 },
            },
          },
        },
      },
    });

    const result = hydrateTimingServiceFromStore({ service, store });

    expect(result.keyframeTopics).toEqual(['AudioStreams']);
    expect(service.processors.timingData.state).toMatchObject({
      Lines: {
        '4': {
          Line: 1,
          NumberOfLaps: 12,
          BestLapTime: { Value: '1:30.000', Lap: 12 },
        },
      },
    });
    expect(service.processors.timingData.bestLaps.get('4')).toMatchObject({
      time: '1:30.000',
      lap: 12,
    });
  });
});
