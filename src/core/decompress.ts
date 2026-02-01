import { inflateRaw, inflateRawSync } from 'node:zlib';
import { promisify } from 'node:util';

const inflateRawAsync = promisify(inflateRaw);
const DEFAULT_MAX_OUTPUT_BYTES = 50 * 1024 * 1024;

export async function inflateBase64(
  payload: string,
  options: { maxOutputBytes?: number } = {},
): Promise<string> {
  const buf = Buffer.from(payload, 'base64');
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const inflated = await inflateRawAsync(buf, { maxOutputLength: maxOutputBytes });
  return inflated.toString('utf-8');
}

export function inflateBase64Sync(
  payload: string,
  options: { maxOutputBytes?: number } = {},
): string {
  const buf = Buffer.from(payload, 'base64');
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const inflated = inflateRawSync(buf, { maxOutputLength: maxOutputBytes });
  return inflated.toString('utf-8');
}
