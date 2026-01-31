import path from 'node:path';

export function getDataDir(appName: string): string {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? process.env.APPDATA ?? '';
    return path.join(local, appName, 'data');
  }

  const xdg = process.env.XDG_DATA_HOME;
  if (xdg && xdg.trim().length > 0) {
    return path.join(xdg, appName, 'data');
  }

  const home = process.env.HOME ?? '';
  return path.join(home, '.local', 'share', appName, 'data');
}
