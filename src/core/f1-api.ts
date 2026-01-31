import type { MeetingsIndex } from './types.js';

const USER_AGENT = `f1aire/0.1.0`;
const FETCH_TIMEOUT_MS = 10_000;

function isMeetingsIndex(data: unknown): data is MeetingsIndex {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const record = data as { Year?: unknown; Meetings?: unknown };
  return typeof record.Year === 'number' && Array.isArray(record.Meetings);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

export async function getMeetings(year: number): Promise<MeetingsIndex> {
  const url = `https://livetiming.formula1.com/static/${year}/Index.json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Timed out fetching meetings for ${year} after ${FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch meetings for ${year}: ${res.status}`);
  }
  const payload: unknown = await res.json();
  if (!isMeetingsIndex(payload)) {
    throw new Error(
      `Invalid meetings index payload for ${year}: expected { Year: number; Meetings: array }`,
    );
  }
  return payload;
}
