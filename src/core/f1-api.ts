import type { MeetingsIndex } from './types.js';

const USER_AGENT = `f1aire/0.1.0`;

export async function getMeetings(year: number): Promise<MeetingsIndex> {
  const url = `https://livetiming.formula1.com/static/${year}/Index.json`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch meetings for ${year}: ${res.status}`);
  }
  return (await res.json()) as MeetingsIndex;
}
