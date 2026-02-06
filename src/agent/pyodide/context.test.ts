import { describe, it, expect } from 'vitest';
import { buildPythonContext } from './context.js';

describe('buildPythonContext', () => {
  it('returns a structured-clone safe context', () => {
    const context = buildPythonContext({
      vars: {
        driverNumber: '4',
        laps: [1, 2, 3],
        startedAt: new Date('2025-01-01T00:00:00Z'),
      },
    });

    expect(context).toHaveProperty('vars');
    expect(() => structuredClone(context)).not.toThrow();
  });

  it('includes provided vars in the context', () => {
    const context = buildPythonContext({
      vars: { rows: [{ lap: 1 }] },
    });

    expect(context.vars).toEqual({ rows: [{ lap: 1 }] });
    expect(() => structuredClone(context)).not.toThrow();
  });
});
