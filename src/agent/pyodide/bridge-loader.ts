import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function resolveBridgeModuleUrl({
  baseUrl = import.meta.url,
  existsSync = fs.existsSync,
}: {
  baseUrl?: string | URL;
  existsSync?: (path: string) => boolean;
} = {}) {
  const jsUrl = new URL('./python-bridge.js', baseUrl);
  if (existsSync(fileURLToPath(jsUrl))) {
    return jsUrl;
  }
  return new URL('./python-bridge.ts', baseUrl);
}
