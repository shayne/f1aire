import { describe, expect, it } from 'vitest';
import { DriverListProcessor } from './driver-list.js';

describe('DriverListProcessor', () => {
  it('merges patches and exposes typed driver lookups', () => {
    const processor = new DriverListProcessor();

    processor.process({
      type: 'DriverList',
      json: {
        '4': {
          BroadcastName: 'NORRIS',
          TeamName: 'McLaren',
        },
      },
      dateTime: new Date('2026-03-09T12:00:00.000Z'),
    });

    processor.process({
      type: 'DriverList',
      json: {
        '4': {
          FullName: 'Lando Norris',
        },
        '81': {
          FullName: 'Oscar Piastri',
          TeamName: 'McLaren',
        },
      },
      dateTime: new Date('2026-03-09T12:00:01.000Z'),
    });

    expect(processor.getEntry('4')).toMatchObject({
      BroadcastName: 'NORRIS',
      FullName: 'Lando Norris',
      TeamName: 'McLaren',
    });
    expect(processor.getName('4')).toBe('Lando Norris');
    expect(processor.getTeamName('81')).toBe('McLaren');
  });
});
