import type { Summary } from '../core/summary.js';
import type { Meeting, Session } from '../core/types.js';

export type Screen =
  | { name: 'season' }
  | { name: 'settings'; returnTo: Screen }
  | { name: 'apiKey'; returnTo: Screen }
  | { name: 'meeting'; year: number; meetings: Meeting[] }
  | { name: 'session'; year: number; meetings: Meeting[]; meeting: Meeting }
  | {
      name: 'downloading';
      year: number;
      meetings: Meeting[];
      meeting: Meeting;
      session: Session;
    }
  | {
      name: 'summary';
      year: number;
      meetings: Meeting[];
      meeting: Meeting;
      summary: Summary;
      dir: string;
    }
  | {
      name: 'engineer';
      year: number;
      meetings: Meeting[];
      meeting: Meeting;
      session: Session;
      dir: string;
    };

export function getBackScreen(screen: Screen): Screen | null {
  if (screen.name === 'settings' || screen.name === 'apiKey') {
    return screen.returnTo;
  }
  if (screen.name === 'meeting') return { name: 'season' };
  if (screen.name === 'session') {
    return { name: 'meeting', year: screen.year, meetings: screen.meetings };
  }
  if (
    screen.name === 'downloading' ||
    screen.name === 'summary' ||
    screen.name === 'engineer'
  ) {
    return {
      name: 'session',
      year: screen.year,
      meetings: screen.meetings,
      meeting: screen.meeting,
    };
  }
  return null;
}
