import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './xdg.js';

export type AppConfig = {
  openaiApiKey?: string;
};

const CONFIG_FILENAME = 'config.json';

export function getAppConfigPath(appName: string): string {
  return path.join(getConfigDir(appName), CONFIG_FILENAME);
}

export async function readAppConfig(appName: string): Promise<AppConfig> {
  const configPath = getAppConfigPath(appName);
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const openaiApiKey = (parsed as any).openaiApiKey;
    return typeof openaiApiKey === 'string' && openaiApiKey.trim().length > 0
      ? { openaiApiKey }
      : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function writeOpenAIApiKey(appName: string, apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    throw new Error('OpenAI API key is empty.');
  }

  const configDir = getConfigDir(appName);
  const configPath = getAppConfigPath(appName);

  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

  const next: AppConfig = { openaiApiKey: trimmed };
  const json = JSON.stringify(next, null, 2) + '\n';
  await fs.writeFile(configPath, json, { encoding: 'utf-8', mode: 0o600 });

  // Best-effort unix permissions (ignored on Windows).
  try {
    await fs.chmod(configDir, 0o700);
  } catch {}
  try {
    await fs.chmod(configPath, 0o600);
  } catch {}
}

export async function clearStoredOpenAIApiKey(appName: string) {
  const configPath = getAppConfigPath(appName);
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(configPath, 'utf-8')) as unknown;
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return;
    throw err;
  }

  if (!parsed || typeof parsed !== 'object') {
    await fs.unlink(configPath).catch((err) => {
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return;
      throw err;
    });
    return;
  }

  const copy = { ...(parsed as Record<string, unknown>) };
  delete copy.openaiApiKey;

  if (Object.keys(copy).length === 0) {
    await fs.unlink(configPath).catch((err) => {
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return;
      throw err;
    });
    return;
  }

  const json = JSON.stringify(copy, null, 2) + '\n';
  await fs.writeFile(configPath, json, { encoding: 'utf-8', mode: 0o600 });
  try {
    await fs.chmod(configPath, 0o600);
  } catch {}
}

