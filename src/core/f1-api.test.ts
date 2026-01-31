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

  it('throws a timeout error when the request is aborted during json parsing', async () => {
    vi.useFakeTimers();
    let providedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(async (_url, options) => {
      const signal = (options as RequestInit | undefined)?.signal;
      providedSignal = signal as AbortSignal | undefined;
      return {
        ok: true,
        json: () =>
          new Promise((_, reject) => {
            if (!signal) {
              reject(new Error('Missing abort signal'));
              return;
            }
            if (signal.aborted) {
              reject(new DOMException('Request aborted', 'AbortError'));
              return;
            }
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Request aborted', 'AbortError')),
              { once: true },
            );
          }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      const request = getMeetings(2024);
      const expectation = expect(request).rejects.toThrow(
        'Timed out fetching meetings for 2024 after 10000ms',
      );
      await vi.advanceTimersByTimeAsync(10_000);
      await expectation;
      expect(providedSignal).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
