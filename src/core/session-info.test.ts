import { describe, expect, it } from 'vitest';
import {
  getSessionInfoStaticPrefix,
  getSessionInfoSummary,
  getSessionScheduledStartUtc,
  isQualifyingSession,
  isRaceSession,
  isSprintSession,
} from './session-info.js';

describe('session-info', () => {
  it('builds a deterministic SessionInfo summary with derived UTC start', () => {
    expect(
      getSessionInfoSummary({
        Key: '3001',
        Name: 'Race',
        Type: 'Race',
        Path: '2025/2025-05-25_Monaco_Grand_Prix/2025-05-25_Race/',
        StartDate: '2025-05-25T15:00:00',
        EndDate: '2025-05-25T17:00:00',
        GmtOffset: '+0200',
        Meeting: {
          Key: '44',
          Name: 'Monaco Grand Prix',
          OfficialName: 'FORMULA 1 TAG HEUER GRAND PRIX DE MONACO 2025',
          Location: 'Monte Carlo',
          Country: {
            Key: '43',
            Code: 'MC',
            Name: 'Monaco',
          },
          Circuit: {
            Key: '6',
            ShortName: 'Monaco',
          },
        },
        CircuitPoints: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        CircuitCorners: [
          { number: 1, x: 5.5, y: 6.5 },
          { Number: '2', X: '7', Y: '8' },
        ],
        CircuitRotation: '90',
      }),
    ).toEqual({
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
        Key: 44,
        Name: 'Monaco Grand Prix',
        OfficialName: 'FORMULA 1 TAG HEUER GRAND PRIX DE MONACO 2025',
        Location: 'Monte Carlo',
        Country: {
          Key: 43,
          Code: 'MC',
          Name: 'Monaco',
        },
        Circuit: {
          Key: 6,
          ShortName: 'Monaco',
        },
      },
      CircuitGeometry: {
        pointCount: 2,
        cornerCount: 2,
        rotation: 90,
        hasGeometry: true,
        sampleCorners: [
          { number: 1, x: 5.5, y: 6.5 },
          { number: 2, x: 7, y: 8 },
        ],
      },
    });
  });

  it('normalizes static prefixes, explicit timezones, and session-type flags', () => {
    const value = {
      Type: 'Qualifying',
      Path: 'https://livetiming.formula1.com/static/custom/session/',
      StartDate: '2025-05-24T16:00:00+01:00',
    };

    expect(getSessionInfoStaticPrefix(value)).toBe(
      'https://livetiming.formula1.com/static/custom/session/',
    );
    expect(getSessionScheduledStartUtc(value)).toBe('2025-05-24T15:00:00.000Z');
    expect(isRaceSession(value)).toBe(false);
    expect(isQualifyingSession(value)).toBe(true);
    expect(isSprintSession({ Type: 'Sprint' })).toBe(true);
  });
});
