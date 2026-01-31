import { describe, expect, it } from 'vitest';
import { parseJsonStreamLines } from './parse.js';

const sample = [
  '00:00:01.000{"foo":1}',
  '00:00:02.500{"bar":2}',
].join('\n');

describe('parseJsonStreamLines', () => {
  it('parses offsets and json payloads', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const points = parseJsonStreamLines('TimingData', sample, start);
    expect(points).toHaveLength(2);
    expect(points[0].type).toBe('TimingData');
    expect(points[0].dateTime.toISOString()).toBe('2024-01-01T00:00:01.000Z');
    expect(points[1].json.bar).toBe(2);
  });
});
