import { describe, expect, it, vi } from 'vitest';
import { SessionInfoProcessor } from './session-info.js';

describe('SessionInfoProcessor', () => {
  it('enriches SessionInfo with circuit geometry from the external API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          X: [100, 200, 300],
          Y: [10, 20, 30],
          Corners: [
            { Number: 1, TrackPosition: { X: 12.5, Y: 24.25 } },
            { number: 2, trackPosition: { x: 36, y: 48 } },
          ],
          Rotation: 180,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const processor = new SessionInfoProcessor({
      apiBaseUrl: 'https://example.test',
      fetchImpl,
    });

    processor.process({
      type: 'SessionInfo',
      json: {
        Name: 'Race',
        StartDate: '2025-05-25T14:00:00',
        Meeting: {
          Circuit: {
            Key: 55,
            ShortName: 'Monaco',
          },
        },
      },
      dateTime: new Date('2025-05-25T12:00:00Z'),
    });

    await processor.waitForCircuitData();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://example.test/api/v1/circuits/55/2025',
    );
    expect(processor.state).toMatchObject({
      Name: 'Race',
      CircuitPoints: [
        { x: 100, y: 10 },
        { x: 200, y: 20 },
        { x: 300, y: 30 },
      ],
      CircuitCorners: [
        { number: 1, x: 12.5, y: 24.25 },
        { number: 2, x: 36, y: 48 },
      ],
      CircuitRotation: 180,
    });
  });

  it('falls back to the session path year when StartDate is unavailable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ X: [1], Y: [2], Rotation: 90 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const processor = new SessionInfoProcessor({
      apiBaseUrl: 'https://example.test',
      fetchImpl,
    });

    processor.process({
      type: 'SessionInfo',
      json: {
        Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
        Meeting: {
          Circuit: {
            Key: '77',
          },
        },
      },
      dateTime: new Date('2024-05-26T12:00:00Z'),
    });

    await processor.waitForCircuitData();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://example.test/api/v1/circuits/77/2024',
    );
  });

  it('does not refetch when circuit geometry is already present', async () => {
    const fetchImpl = vi.fn();
    const processor = new SessionInfoProcessor({ fetchImpl });

    processor.process({
      type: 'SessionInfo',
      json: {
        Meeting: {
          Circuit: {
            Key: 44,
          },
        },
        CircuitPoints: [{ x: 1, y: 2 }],
        CircuitCorners: [{ number: 1, x: 3, y: 4 }],
        CircuitRotation: 0,
      },
      dateTime: new Date('2025-01-01T00:00:00Z'),
    });

    await processor.waitForCircuitData();

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
