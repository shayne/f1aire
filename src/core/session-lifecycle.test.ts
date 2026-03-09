import { describe, expect, it } from 'vitest';
import {
  buildSessionDataState,
  buildSessionLifecycleSnapshot,
  getSessionLifecycleEvents,
} from './session-lifecycle.js';

describe('session lifecycle helpers', () => {
  it('builds a merged lifecycle timeline from session data and standalone status feeds', () => {
    const sessionDataState = buildSessionDataState({
      baseState: {
        StatusSeries: [
          {
            Utc: '2024-07-05T11:30:01.009Z',
            SessionStatus: 'Started',
          },
        ],
      },
      timeline: [
        {
          json: {
            StatusSeries: {
              '1': {
                Utc: '2024-07-05T11:34:24.114Z',
                TrackStatus: 'Yellow',
              },
            },
          },
        },
        {
          json: {
            StatusSeries: {
              '2': {
                Utc: '2024-07-05T11:38:50.337Z',
                SessionStatus: 'Aborted',
              },
            },
          },
        },
      ],
    });

    const snapshot = buildSessionLifecycleSnapshot({
      sessionDataState,
      sessionStatusState: {
        Status: 'Started',
        Utc: '2024-07-05T11:46:00.078Z',
      },
      archiveStatusState: { Status: 'Complete' },
      sessionInfoState: {
        SessionStatus: 'Inactive',
        ArchiveStatus: { Status: 'Generating' },
      },
    });

    expect(snapshot.sessionStatus).toEqual({
      status: 'Started',
      utc: '2024-07-05T11:46:00.078Z',
      source: 'SessionStatus',
    });
    expect(snapshot.trackStatus).toEqual({
      status: 'Yellow',
      utc: '2024-07-05T11:34:24.114Z',
      source: 'SessionData',
    });
    expect(snapshot.archiveStatus).toEqual({
      status: 'Complete',
      source: 'ArchiveStatus',
      raw: { Status: 'Complete' },
    });
    expect(
      snapshot.events.map((event) => ({
        source: event.source,
        utc: event.utc,
        sessionStatus: event.sessionStatus,
        trackStatus: event.trackStatus,
      })),
    ).toEqual([
      {
        source: 'SessionData',
        utc: '2024-07-05T11:30:01.009Z',
        sessionStatus: 'Started',
        trackStatus: null,
      },
      {
        source: 'SessionData',
        utc: '2024-07-05T11:34:24.114Z',
        sessionStatus: null,
        trackStatus: 'Yellow',
      },
      {
        source: 'SessionData',
        utc: '2024-07-05T11:38:50.337Z',
        sessionStatus: 'Aborted',
        trackStatus: null,
      },
      {
        source: 'SessionStatus',
        utc: '2024-07-05T11:46:00.078Z',
        sessionStatus: 'Started',
        trackStatus: null,
      },
    ]);
  });

  it('falls back to SessionInfo nested lifecycle fields when no dedicated feeds exist', () => {
    const snapshot = buildSessionLifecycleSnapshot({
      sessionInfoState: {
        SessionStatus: 'Inactive',
        ArchiveStatus: { Status: 'Generating' },
      },
    });

    expect(snapshot.sessionStatus).toEqual({
      status: 'Inactive',
      utc: null,
      source: 'SessionInfo',
    });
    expect(snapshot.trackStatus).toBeNull();
    expect(snapshot.archiveStatus).toEqual({
      status: 'Generating',
      source: 'SessionInfo',
      raw: { Status: 'Generating' },
    });
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({
      source: 'SessionInfo',
      sessionStatus: 'Inactive',
      trackStatus: null,
    });
  });

  it('deduplicates mirrored SessionStatus updates in favour of the dedicated feed', () => {
    const events = getSessionLifecycleEvents({
      sessionDataState: {
        StatusSeries: {
          '0': {
            Utc: '2024-07-05T11:30:01.009Z',
            SessionStatus: 'Started',
          },
        },
      },
      sessionStatusState: {
        Utc: '2024-07-05T11:30:01.009Z',
        Status: 'Started',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'SessionStatus',
      utc: '2024-07-05T11:30:01.009Z',
      sessionStatus: 'Started',
    });
  });
});
