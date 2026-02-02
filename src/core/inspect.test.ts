import { describe, expect, it } from 'vitest';
import { shapeOf, shapeOfMany } from './inspect.js';

describe('shapeOf', () => {
  it('summarizes primitives and objects', () => {
    const shape = shapeOf({ a: 1, b: 'x', c: null, d: { e: true } });

    expect(shape).toEqual({
      a: 'number',
      b: 'string',
      c: 'null',
      d: { e: 'boolean' },
    });
  });

  it('summarizes arrays with item shapes', () => {
    const shape = shapeOf([{ a: 1 }, { a: 2, b: 'x' }]);

    expect(shape).toEqual({
      _type: 'array',
      items: {
        a: 'number',
        b: 'string',
      },
    });
  });
});

describe('shapeOfMany', () => {
  it('merges primitive shapes', () => {
    const shape = shapeOfMany([1, 'two']);

    expect(shape).toBe('number|string');
  });
});
