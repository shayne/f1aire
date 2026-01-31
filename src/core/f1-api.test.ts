import { describe, expect, it, vi, afterEach } from 'vitest';
import { getMeetings } from './f1-api.js';
import type { MeetingsIndex } from './types.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMeetings', () => {
  it('requests the correct index url and returns parsed JSON', async () => {
    const payload: MeetingsIndex = { Year: 2024, Meetings: [] };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMeetings(2024);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://livetiming.formula1.com/static/2024/Index.json',
      expect.any(Object),
    );
    expect(result.Year).toBe(2024);
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMeetings(2024)).rejects.toThrow(
      'Failed to fetch meetings for 2024: 503',
    );
  });

  it('throws when the payload shape is invalid', async () => {
    const invalidPayload = { Year: '2024', Meetings: {} };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(invalidPayload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(getMeetings(2024)).rejects.toThrow(
      'Invalid meetings index payload for 2024: expected { Year: number; Meetings: array }',
    );
  });
});
