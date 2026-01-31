import os from 'node:os';
import path from 'node:path';

export function getDataDir(appName: string): string {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? '';
    const base = local.trim().length > 0 ? local : getFallbackHome();
    return path.join(base, appName, 'data');
  }

  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, appName, 'data');
  }

  const home = process.env.HOME ?? '';
  const base = home.trim().length > 0 ? home : getFallbackHome();
  return path.join(base, '.local', 'share', appName, 'data');
}

function getFallbackHome(): string {
  const home = os.homedir().trim();
  if (home.length > 0) {
    return home;
  }
  throw new Error('Unable to determine a home directory for data storage.');
}
