import os from 'node:os';
import path from 'node:path';

export function getDataDir(appName: string): string {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? '';
    const base = local.trim().length > 0 ? local : getWindowsFallbackBase();
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

export function getConfigDir(appName: string): string {
  if (process.platform === 'win32') {
    const baseRaw = process.env.APPDATA ?? '';
    const base =
      baseRaw.trim().length > 0 ? baseRaw : getWindowsFallbackConfigBase();
    return path.join(base, appName);
  }

  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, appName);
  }

  const home = process.env.HOME ?? '';
  const base = home.trim().length > 0 ? home : getFallbackHome();
  return path.join(base, '.config', appName);
}

function getFallbackHome(): string {
  const home = os.homedir().trim();
  if (home.length > 0) {
    return home;
  }
  throw new Error('Unable to determine a home directory for data storage.');
}

function getWindowsFallbackBase(): string {
  const home = os.homedir().trim();
  if (home.length === 0) {
    throw new Error('Unable to determine a home directory for data storage.');
  }
  return path.join(home, 'AppData', 'Local');
}

function getWindowsFallbackConfigBase(): string {
  const home = getFallbackHome();
  return path.join(home, 'AppData', 'Roaming');
}
