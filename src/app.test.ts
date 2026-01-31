import { describe, expect, it } from 'vitest';
import type { Summary } from './core/summary.js';
import type { Meeting, Session } from './core/types.js';
import { getBackScreen } from './tui/navigation.js';

const session: Session = {
  Key: 10,
  Name: 'Race',
  Type: 'Race',
  StartDate: '2024-01-01T00:00:00.000Z',
  EndDate: '2024-01-01T01:00:00.000Z',
  GmtOffset: '+00:00',
  Path: '2024/test/',
};

const meeting: Meeting = {
  Key: 1,
  Name: 'Test GP',
  Location: 'Testville',
  Sessions: [session],
};

const meetings = [meeting];
const year = 2024;

const summary: Summary = {
  winner: null,
  fastestLap: null,
  totalLaps: null,
};

describe('getBackScreen', () => {
  it('returns season from meeting', () => {
    expect(getBackScreen({ name: 'meeting', year, meetings })).toEqual({ name: 'season' });
  });

  it('returns meeting from session', () => {
    expect(getBackScreen({ name: 'session', year, meetings, meeting })).toEqual({
      name: 'meeting',
      year,
      meetings,
    });
  });

  it('returns session from downloading', () => {
    expect(
      getBackScreen({ name: 'downloading', year, meetings, meeting, session }),
    ).toEqual({
      name: 'session',
      year,
      meetings,
      meeting,
    });
  });

  it('returns session from summary', () => {
    expect(
      getBackScreen({ name: 'summary', year, meetings, meeting, summary, dir: '/tmp' }),
    ).toEqual({
      name: 'session',
      year,
      meetings,
      meeting,
    });
  });
});
