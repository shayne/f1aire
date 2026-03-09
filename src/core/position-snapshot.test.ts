import { describe, expect, it } from 'vitest';
import {
  buildPositionSnapshotFromTimelines,
  getPositionSnapshot,
} from './position-snapshot.js';

describe('position-snapshot', () => {
  it('combines position, telemetry, timing order, and driver metadata', () => {
    const snapshot = getPositionSnapshot({
      positionState: {
        Position: [
          {
            Timestamp: '2025-03-01T12:00:05.000Z',
            Entries: {
              '4': { Status: 'OnTrack', X: '10', Y: 20, Z: '30' },
              '81': { Status: 'OffTrack', X: 40, Y: '50', Z: 60 },
            },
          },
        ],
      },
      carDataState: {
        Entries: [
          {
            Utc: '2025-03-01T12:00:05.050Z',
            Cars: {
              '4': { Channels: { '2': '302', '3': '8', '45': '10' } },
              '81': { Channels: { '2': 120, '3': '3', '45': '8' } },
            },
          },
        ],
      },
      timingDataState: {
        Lines: {
          '81': { Line: 2 },
          '4': { Position: '1' },
        },
      },
      driverListState: {
        '4': { FullName: 'Lando Norris' },
        '81': { BroadcastName: 'Oscar Piastri' },
      },
    });

    expect(snapshot).toEqual({
      positionTimestamp: '2025-03-01T12:00:05.000Z',
      telemetryUtc: '2025-03-01T12:00:05.050Z',
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

  it('rebuilds a historical snapshot from normalized timelines', () => {
    const snapshot = buildPositionSnapshotFromTimelines({
      positionTimeline: [
        {
          type: 'Position',
          json: {
            Position: [
              {
                Timestamp: '2025-03-01T12:00:02.000Z',
                Entries: {
                  '4': { Status: 'OnTrack', X: 5, Y: 6, Z: 7 },
                },
              },
            ],
          },
          dateTime: new Date('2025-03-01T12:00:02.000Z'),
        },
      ],
      carDataTimeline: [
        {
          type: 'CarData',
          json: {
            Entries: [
              {
                Utc: '2025-03-01T12:00:02.100Z',
                Cars: {
                  '4': { Channels: { '2': '305', '3': '8', '45': '12' } },
                },
              },
            ],
          },
          dateTime: new Date('2025-03-01T12:00:02.100Z'),
        },
      ],
      driverListState: {
        '4': { FullName: 'Lando Norris' },
      },
      timingDataState: {
        Lines: {
          '4': { Line: 1 },
        },
      },
      driverNumber: '4',
    });

    expect(snapshot).toEqual({
      positionTimestamp: '2025-03-01T12:00:02.000Z',
      telemetryUtc: '2025-03-01T12:00:02.100Z',
      totalDrivers: 1,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 1,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 5, y: 6, z: 7 },
          telemetry: {
            rpm: null,
            speed: 305,
            gear: 8,
            throttle: null,
            brake: null,
            drs: 12,
          },
        },
      ],
    });
  });

  it('rebuilds exact-time timing order from timing feed timelines', () => {
    const snapshot = buildPositionSnapshotFromTimelines({
      positionTimeline: [
        {
          type: 'Position',
          json: {
            Position: [
              {
                Timestamp: '2025-03-01T12:00:02.260Z',
                Entries: {
                  '4': { Status: 'OnTrack', X: 5, Y: 6, Z: 7 },
                  '81': { Status: 'OnTrack', X: 8, Y: 9, Z: 10 },
                },
              },
            ],
          },
          dateTime: new Date('2025-03-01T12:00:02.260Z'),
        },
      ],
      carDataTimeline: [
        {
          type: 'CarData',
          json: {
            Entries: [
              {
                Utc: '2025-03-01T12:00:02.270Z',
                Cars: {
                  '4': { Channels: { '2': '305', '3': '8' } },
                  '81': { Channels: { '2': '300', '3': '7' } },
                },
              },
            ],
          },
          dateTime: new Date('2025-03-01T12:00:02.270Z'),
        },
      ],
      timingDataTimeline: [
        {
          type: 'TimingData',
          json: {
            Lines: {
              '4': { Line: 2, NumberOfLaps: 12 },
              '81': { Line: 1, NumberOfLaps: 12 },
            },
          },
          dateTime: new Date('2025-03-01T12:00:02.000Z'),
        },
        {
          type: 'TimingDataF1',
          json: {
            Lines: {
              '4': { Line: 1 },
              '81': { Line: 2 },
            },
          },
          dateTime: new Date('2025-03-01T12:00:02.200Z'),
        },
      ],
      driverListState: {
        '4': { FullName: 'Lando Norris' },
        '81': { BroadcastName: 'Oscar Piastri' },
      },
    });

    expect(snapshot).toEqual({
      positionTimestamp: '2025-03-01T12:00:02.260Z',
      telemetryUtc: '2025-03-01T12:00:02.270Z',
      totalDrivers: 2,
      drivers: [
        {
          driverNumber: '4',
          driverName: 'Lando Norris',
          timingPosition: 1,
          status: 'OnTrack',
          offTrack: false,
          coordinates: { x: 5, y: 6, z: 7 },
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
          coordinates: { x: 8, y: 9, z: 10 },
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
  });
});
