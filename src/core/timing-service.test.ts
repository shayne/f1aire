import { describe, it, expect } from 'vitest';
import { TimingService } from './timing-service.js';

const points = [
  { type: 'DriverList', json: { '1': { FullName: 'Max Verstappen' } }, dateTime: new Date('2025-01-01T00:00:01Z') },
  { type: 'TimingData', json: { Lines: { '1': { BestLapTime: { Value: '1:20.000' } } } }, dateTime: new Date('2025-01-01T00:00:02Z') },
];

describe('TimingService', () => {
  it('routes points to processors and tracks best laps', () => {
    const service = new TimingService();
    points.forEach((p) => service.enqueue(p));
    expect((service.processors.driverList.latest as any)?.['1']?.FullName).toBe('Max Verstappen');
    expect(service.processors.timingData.bestLaps.get('1')?.time).toBe('1:20.000');
  });
});
