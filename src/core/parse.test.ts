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

  it('parses CRLF line endings', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const crlfSample = [
      '00:00:01.000{"foo":1}',
      '00:00:02.500{"bar":2}',
    ].join('\r\n');
    const points = parseJsonStreamLines('TimingData', crlfSample, start);
    expect(points).toHaveLength(2);
    expect(points[1].dateTime.toISOString()).toBe('2024-01-01T00:00:02.500Z');
  });

  it('skips malformed lines', () => {
    const start = new Date('2024-01-01T00:00:00.000Z');
    const mixedSample = [
      '00:00:01.000{"ok":true}',
      'bad-offset{"nope":true}',
      '00:00:03.000{"broken":',
    ].join('\n');
    const points = parseJsonStreamLines('TimingData', mixedSample, start);
    expect(points).toHaveLength(1);
    expect(points[0].json.ok).toBe(true);
  });
});
