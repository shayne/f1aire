import { describe, expect, it, vi } from 'vitest';
import { normalizeToolArgsForPostMessage } from './worker.js';

describe('normalizeToolArgsForPostMessage', () => {
  it('converts PyProxy-like args to structured-clone safe objects', () => {
    const proxy = {
      toJs: () => ({ driverNumbers: ['4'] }),
    };

    expect(() => structuredClone(proxy as any)).toThrow();

    const normalized = normalizeToolArgsForPostMessage(proxy as any);
    expect(normalized).toEqual({ driverNumbers: ['4'] });
    expect(() => structuredClone(normalized)).not.toThrow();
  });

  it('passes through plain objects', () => {
    expect(normalizeToolArgsForPostMessage({ a: 1 })).toEqual({ a: 1 });
    expect(normalizeToolArgsForPostMessage(null)).toBeNull();
    expect(normalizeToolArgsForPostMessage(123)).toBe(123);
  });

  it('falls back to empty args if conversion throws', () => {
    const proxy = {
      toJs: () => {
        throw new Error('boom');
      },
    };
    expect(normalizeToolArgsForPostMessage(proxy as any)).toEqual({});
  });
});
