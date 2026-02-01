import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { inflateBase64 } from './decompress.js';

describe('inflateBase64', () => {
  it('inflates base64 deflateRaw payloads', async () => {
    const input = JSON.stringify({ a: 1, b: 'ok' });
    const encoded = deflateRawSync(Buffer.from(input)).toString('base64');
    const output = await inflateBase64(encoded);
    expect(output).toBe(input);
  });

  it('throws when inflated output exceeds maxOutputBytes', async () => {
    const input = 'x'.repeat(64);
    const encoded = deflateRawSync(Buffer.from(input)).toString('base64');
    await expect(inflateBase64(encoded, { maxOutputBytes: 10 })).rejects.toThrow();
  });
});
