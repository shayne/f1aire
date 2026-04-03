import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderTui } from '#ink/testing';
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

type RuntimeProgressUpdate = {
  phase: 'downloading' | 'extracting' | 'ready';
  message: string;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

async function waitFor(
  fn: () => boolean,
  {
    timeoutMs = 1500,
    debug,
  }: { timeoutMs?: number; debug?: () => string } = {},
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const tail = debug ? `\n\nLast frame:\n${debug()}` : '';
  throw new Error(`Timed out waiting for condition${tail}`);
}

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

  it('returns returnTo for settings and apiKey screens', () => {
    const returnTo = { name: 'season' } as const;

    expect(getBackScreen({ name: 'settings', returnTo })).toEqual(returnTo);
    expect(getBackScreen({ name: 'apiKey', returnTo })).toEqual(returnTo);
  });
});

describe('App shell routes', () => {
  it('renders the season route through the shared f1aire shell instead of the engineer shell', async () => {
    vi.doMock('./agent/pyodide/assets.js', () => ({
      ensurePyodideAssets: async ({
        onProgress,
      }: {
        onProgress?: (update: RuntimeProgressUpdate) => void;
      }) => {
        onProgress?.({ phase: 'ready', message: 'Python runtime ready.' });
      },
    }));

    const { App } = await import('./app.js');
    const app = await renderTui(React.createElement(App), {
      columns: 72,
      rows: 20,
    });

    await waitFor(
      () =>
        (app.lastFrame() ?? '').includes('Select a season') &&
        (app.lastFrame() ?? '').includes('Start a f1aire race-engineer session'),
      {
        debug: () => app.lastFrame() ?? '',
      },
    );

    const frame = app.lastFrame() ?? '';
    expect(frame).toContain('f1aire');
    expect(frame).toContain('Virtual Race Engineer');
    expect(frame).toContain('Select a season');
    expect(frame).toContain('Start a f1aire race-engineer session');
    expect(frame).not.toContain('Ask the engineer');
    expect(frame).not.toContain('Quick summary:');
    app.unmount();
  });
});
