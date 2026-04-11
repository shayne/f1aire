import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './xdg.js';

export const OPENAI_AUTH_PREFERENCES = ['chatgpt', 'api-key'] as const;

export type OpenAIAuthPreference = (typeof OPENAI_AUTH_PREFERENCES)[number];

export type OpenAIChatGptAuthConfig = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
  accountEmail?: string;
  planType?: string;
};

export type AppConfig = {
  openaiAuthPreference?: OpenAIAuthPreference;
  openaiApiKey?: string;
  openaiChatGptAuth?: OpenAIChatGptAuthConfig;
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
    const openaiAuthPreference = (parsed as any).openaiAuthPreference;
    const openaiApiKey = (parsed as any).openaiApiKey;
    const openaiChatGptAuth = normalizeOpenAIChatGptAuth(
      (parsed as any).openaiChatGptAuth,
    );
    return {
      ...(openaiAuthPreference === 'chatgpt' ||
      openaiAuthPreference === 'api-key'
        ? { openaiAuthPreference }
        : {}),
      ...(typeof openaiApiKey === 'string' && openaiApiKey.trim().length > 0
        ? { openaiApiKey }
        : {}),
      ...(openaiChatGptAuth ? { openaiChatGptAuth } : {}),
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAppConfig(appName: string, next: AppConfig) {
  const configDir = getConfigDir(appName);
  const configPath = getAppConfigPath(appName);

  if (Object.keys(next).length === 0) {
    await fs.unlink(configPath).catch((err) => {
      if ((err as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return;
      throw err;
    });
    return;
  }

  await fs.mkdir(configDir, { recursive: true, mode: 0o700 });

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

export async function writeOpenAIApiKey(appName: string, apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    throw new Error('OpenAI API key is empty.');
  }

  const current = await readAppConfig(appName);
  await writeAppConfig(appName, {
    ...current,
    openaiAuthPreference: 'api-key',
    openaiApiKey: trimmed,
  });
}

export async function clearStoredOpenAIApiKey(appName: string) {
  const current = await readAppConfig(appName);
  if (!current.openaiApiKey) return;
  const next = { ...current };
  delete next.openaiApiKey;
  if (
    next.openaiAuthPreference === 'api-key' &&
    !next.openaiChatGptAuth
  ) {
    delete next.openaiAuthPreference;
  }
  await writeAppConfig(appName, next);
}

export async function writeOpenAIChatGptAuth(
  appName: string,
  openaiChatGptAuth: OpenAIChatGptAuthConfig,
) {
  const normalized = normalizeOpenAIChatGptAuth(openaiChatGptAuth);
  if (!normalized) {
    throw new Error('ChatGPT auth is missing access or refresh tokens.');
  }

  const current = await readAppConfig(appName);
  await writeAppConfig(appName, {
    ...current,
    openaiAuthPreference: 'chatgpt',
    openaiChatGptAuth: normalized,
  });
}

export async function clearStoredOpenAIChatGptAuth(appName: string) {
  const current = await readAppConfig(appName);
  if (!current.openaiChatGptAuth) return;
  const next = { ...current };
  delete next.openaiChatGptAuth;
  await writeAppConfig(appName, next);
}

export async function writeOpenAIAuthPreference(
  appName: string,
  preference: OpenAIAuthPreference,
) {
  const current = await readAppConfig(appName);
  await writeAppConfig(appName, {
    ...current,
    openaiAuthPreference: preference,
  });
}

function normalizeOpenAIChatGptAuth(
  value: unknown,
): OpenAIChatGptAuthConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const accessToken = (value as any).accessToken;
  const refreshToken = (value as any).refreshToken;
  const expiresAt = (value as any).expiresAt;
  const accountId = (value as any).accountId;
  const accountEmail = (value as any).accountEmail;
  const planType = (value as any).planType;

  if (
    typeof accessToken !== 'string' ||
    accessToken.trim().length === 0 ||
    typeof refreshToken !== 'string' ||
    refreshToken.trim().length === 0 ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }

  return {
    accessToken: accessToken.trim(),
    refreshToken: refreshToken.trim(),
    expiresAt,
    ...(typeof accountId === 'string' && accountId.trim().length > 0
      ? { accountId: accountId.trim() }
      : {}),
    ...(typeof accountEmail === 'string' && accountEmail.trim().length > 0
      ? { accountEmail: accountEmail.trim() }
      : {}),
    ...(typeof planType === 'string' && planType.trim().length > 0
      ? { planType: planType.trim() }
      : {}),
  };
}
