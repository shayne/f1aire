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
