import { describe, expect, it, vi } from 'vitest';
import { normalizePythonResultForPostMessage, normalizeToolArgsForPostMessage } from './worker.js';

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

  it('uses copy() when present and destroys only the owned proxy', () => {
    const ownedDestroy = vi.fn();
    const proxy = {
      copy: () => ({
        toJs: () => ({ a: 1 }),
        destroy: ownedDestroy,
      }),
      toJs: vi.fn(() => ({ shouldNot: 'be used' })),
      destroy: vi.fn(),
    };

    const normalized = normalizeToolArgsForPostMessage(proxy as any);
    expect(normalized).toEqual({ a: 1 });
    expect(proxy.toJs).not.toHaveBeenCalled();
    expect(ownedDestroy).toHaveBeenCalledTimes(1);
    expect(proxy.destroy).not.toHaveBeenCalled();
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

describe('normalizePythonResultForPostMessage', () => {
  it('passes through primitives', async () => {
    const fakePyodide = { globals: { set: () => {}, delete: () => {} }, runPythonAsync: async () => null } as any;
    await expect(
      normalizePythonResultForPostMessage({ pyodideInstance: fakePyodide, value: 123 }),
    ).resolves.toBe(123);
    await expect(
      normalizePythonResultForPostMessage({ pyodideInstance: fakePyodide, value: null }),
    ).resolves.toBeNull();
  });

  it('converts PyProxy-like values via toJs and destroys them', async () => {
    const destroy = vi.fn();
    const proxy = {
      toJs: vi.fn(() => ({ ok: 1 })),
      destroy,
    };
    const fakePyodide = { globals: { set: vi.fn(), delete: vi.fn() }, runPythonAsync: vi.fn() } as any;

    const out = await normalizePythonResultForPostMessage({ pyodideInstance: fakePyodide, value: proxy as any });

    expect(out).toEqual({ ok: 1 });
    expect(proxy.toJs).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(fakePyodide.runPythonAsync).not.toHaveBeenCalled();
  });

  it('falls back to python jsonable conversion on ConversionError', async () => {
    const destroy = vi.fn();
    const proxy = {
      toJs: vi.fn(() => {
        throw new Error('pyodide.ffi.ConversionError: No conversion known for x.');
      }),
      destroy,
    };

    const normalizedDestroy = vi.fn();
    const normalizedProxy = {
      toJs: vi.fn(() => [0, 1, 2]),
      destroy: normalizedDestroy,
    };

    const globals = { set: vi.fn(), delete: vi.fn() };
    const fakePyodide = {
      globals,
      runPythonAsync: vi.fn(async () => normalizedProxy),
    } as any;

    const out = await normalizePythonResultForPostMessage({ pyodideInstance: fakePyodide, value: proxy as any });

    expect(out).toEqual([0, 1, 2]);
    expect(globals.set).toHaveBeenCalledWith('__f1aire_result', proxy);
    expect(fakePyodide.runPythonAsync).toHaveBeenCalledWith('__f1aire_to_jsonable(__f1aire_result)');
    expect(normalizedProxy.toJs).toHaveBeenCalled();
    expect(normalizedDestroy).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
