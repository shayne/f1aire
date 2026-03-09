import { describe, expect, it } from 'vitest';
import {
  findDriverNumberByName,
  getDriverListEntries,
  getDriverListEntry,
  getDriverName,
  getDriverNameFromEntry,
  getDriverTeamColour,
  getDriverTeamName,
} from './driver-list.js';

describe('driver-list helpers', () => {
  const state = {
    _kf: true,
    '81': {
      FullName: 'Oscar Piastri',
      BroadcastName: 'PIASTRI',
      Tla: 'PIA',
      TeamName: 'McLaren',
      TeamColour: 'FF8000',
    },
    '4': {
      FullName: 'Lando Norris',
      BroadcastName: 'NORRIS',
      Tla: 'NOR',
      TeamName: 'McLaren',
      TeamColour: 'FF8000',
    },
    ignored: 'not-a-driver',
  };

  it('returns sorted driver entries and filters non-driver keys', () => {
    expect(
      getDriverListEntries(state).map(([driverNumber]) => driverNumber),
    ).toEqual(['4', '81']);
    expect(getDriverListEntry(state, 81)).toMatchObject({
      FullName: 'Oscar Piastri',
      TeamName: 'McLaren',
    });
  });

  it('resolves driver names and team metadata with fallbacks', () => {
    expect(getDriverName(state, '4')).toBe('Lando Norris');
    expect(getDriverTeamName(state, '81')).toBe('McLaren');
    expect(getDriverTeamColour(state, '81')).toBe('FF8000');
    expect(getDriverNameFromEntry({ BroadcastName: 'LECLERC' })).toBe(
      'LECLERC',
    );
    expect(getDriverNameFromEntry({ Tla: 'VER' })).toBe('VER');
  });

  it('finds drivers by number, partial names, and exact TLA', () => {
    expect(findDriverNumberByName(state, '81')).toBe('81');
    expect(findDriverNumberByName(state, 'lando')).toBe('4');
    expect(findDriverNumberByName(state, 'PIAST')).toBe('81');
    expect(findDriverNumberByName(state, 'nor')).toBe('4');
    expect(findDriverNumberByName(state, 'ham')).toBeNull();
  });
});
