import { describe, it, expect, vi } from 'vitest';
import { runPy } from './run-py.js';

const fakeClient = {
  run: vi.fn().mockResolvedValue({ ok: true, value: { answer: 2 } }),
};

describe('runPy', () => {
  it('forwards code to python runtime', async () => {
    const result = await runPy({ code: '1+1', context: { a: 1 }, runtime: fakeClient as any });
    expect(fakeClient.run).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, value: { answer: 2 } });
  });
});
