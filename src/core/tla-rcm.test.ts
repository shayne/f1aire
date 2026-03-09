import { describe, expect, it } from 'vitest';
import { getTlaRcmRecords, summarizeTlaRcmRecords } from './tla-rcm.js';

describe('tla-rcm', () => {
  it('builds typed ticker records from timeline entries', () => {
    const records = getTlaRcmRecords({
      timeline: [
        {
          json: {
            Timestamp: '2026-03-07T16:00:00',
            Message: 'GREEN LIGHT - PIT EXIT OPEN',
          },
          dateTime: new Date('2026-03-07T05:00:02.740Z'),
        },
        {
          json: {
            Timestamp: '2026-03-07T16:04:02',
            Message:
              'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
          },
          dateTime: new Date('2026-03-07T05:04:04.328Z'),
        },
        {
          json: {
            Timestamp: '2026-03-07T16:10:17',
            Message: 'OVERTAKE ENABLED',
          },
          dateTime: new Date('2026-03-07T05:10:19.258Z'),
        },
        {
          json: {
            Timestamp: '2026-03-07T16:22:07',
            Message:
              'INCIDENT INVOLVING CAR 12 (ANT) NOTED - PIT LANE INFRINGEMENT',
          },
          dateTime: new Date('2026-03-07T05:22:09.241Z'),
        },
      ],
    });

    expect(records).toEqual([
      {
        eventId: '0',
        timestamp: '2026-03-07T16:00:00',
        dateTime: new Date('2026-03-07T05:00:02.740Z'),
        message: 'GREEN LIGHT - PIT EXIT OPEN',
        category: 'pit-lane',
        driverNumber: null,
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
        dateTime: new Date('2026-03-07T05:04:04.328Z'),
        message:
          'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
        category: 'track-limits',
        driverNumber: '43',
        lap: 3,
        sector: null,
        pit: false,
        raw: {
          Timestamp: '2026-03-07T16:04:02',
          Message:
            'CAR 43 (COL) TIME 1:23.393 DELETED - TRACK LIMITS AT TURN 7 LAP 3 16:02:50',
        },
      },
      {
        eventId: '2',
        timestamp: '2026-03-07T16:10:17',
        dateTime: new Date('2026-03-07T05:10:19.258Z'),
        message: 'OVERTAKE ENABLED',
        category: 'drs',
        driverNumber: null,
        lap: null,
        sector: null,
        pit: false,
        raw: {
          Timestamp: '2026-03-07T16:10:17',
          Message: 'OVERTAKE ENABLED',
        },
      },
      {
        eventId: '3',
        timestamp: '2026-03-07T16:22:07',
        dateTime: new Date('2026-03-07T05:22:09.241Z'),
        message:
          'INCIDENT INVOLVING CAR 12 (ANT) NOTED - PIT LANE INFRINGEMENT',
        category: 'investigation',
        driverNumber: '12',
        lap: null,
        sector: null,
        pit: true,
        raw: {
          Timestamp: '2026-03-07T16:22:07',
          Message:
            'INCIDENT INVOLVING CAR 12 (ANT) NOTED - PIT LANE INFRINGEMENT',
        },
      },
    ]);
  });

  it('falls back to the latest state and summarizes categories', () => {
    const records = getTlaRcmRecords({
      tlaRcmState: {
        Timestamp: '2026-03-07T16:10:31',
        Message: 'DOUBLE YELLOW IN TRACK SECTOR 2',
      },
    });

    expect(records).toEqual([
      {
        eventId: 'latest',
        timestamp: '2026-03-07T16:10:31',
        dateTime: null,
        message: 'DOUBLE YELLOW IN TRACK SECTOR 2',
        category: 'track-status',
        driverNumber: null,
        lap: null,
        sector: 2,
        pit: false,
        raw: {
          Timestamp: '2026-03-07T16:10:31',
          Message: 'DOUBLE YELLOW IN TRACK SECTOR 2',
        },
      },
    ]);

    expect(summarizeTlaRcmRecords(records)).toEqual({
      total: 1,
      byCategory: {
        'track-status': 1,
        'track-limits': 0,
        investigation: 0,
        'pit-lane': 0,
        'session-control': 0,
        drs: 0,
        other: 0,
      },
      driverCount: 0,
      sectors: [2],
    });
  });
});
