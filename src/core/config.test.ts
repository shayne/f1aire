import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStoredOpenAIApiKey,
  clearStoredOpenAIChatGptAuth,
  getAppConfigPath,
  readAppConfig,
  writeOpenAIAuthPreference,
  writeOpenAIApiKey,
  writeOpenAIChatGptAuth,
} from './config.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function setTempConfigHome(base: string) {
  process.env.XDG_CONFIG_HOME = base;
  process.env.APPDATA = base;
  process.env.HOME = base;
}

describe('app config', () => {
  it('returns empty config when file is missing', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    const cfg = await readAppConfig('f1aire');
    expect(cfg).toEqual({});
  });

  it('writes and reads the stored OpenAI API key', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await writeOpenAIApiKey('f1aire', '  sk-test \n');

    const cfg = await readAppConfig('f1aire');
    expect(cfg.openaiApiKey).toBe('sk-test');
    expect(cfg.openaiAuthPreference).toBe('api-key');

    const raw = await fs.readFile(getAppConfigPath('f1aire'), 'utf-8');
    expect(raw).toContain('sk-test');
  });

  it('writes and reads ChatGPT auth and auth preference', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await writeOpenAIChatGptAuth('f1aire', {
      accessToken: '  access-token \n',
      refreshToken: ' refresh-token ',
      expiresAt: 123456,
      accountId: ' acct-1 ',
      accountEmail: 'user@example.com ',
      planType: ' Pro ',
    });

    const cfg = await readAppConfig('f1aire');
    expect(cfg.openaiAuthPreference).toBe('chatgpt');
    expect(cfg.openaiChatGptAuth).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'acct-1',
      accountEmail: 'user@example.com',
      planType: 'Pro',
    });
  });

  it('clears the stored OpenAI API key and deletes the config file when empty', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await writeOpenAIApiKey('f1aire', 'sk-test');
    await clearStoredOpenAIApiKey('f1aire');

    const cfg = await readAppConfig('f1aire');
    expect(cfg.openaiApiKey).toBeUndefined();

    await expect(fs.stat(getAppConfigPath('f1aire'))).rejects.toThrow();
  });

  it('rejects empty keys', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await expect(writeOpenAIApiKey('f1aire', '   ')).rejects.toThrow(/empty/i);
  });

  it('preserves ChatGPT auth when writing a new API key and toggles preference explicitly', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await writeOpenAIChatGptAuth('f1aire', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'acct-1',
    });
    await writeOpenAIApiKey('f1aire', 'sk-test');
    await writeOpenAIAuthPreference('f1aire', 'chatgpt');

    const cfg = await readAppConfig('f1aire');
    expect(cfg.openaiAuthPreference).toBe('chatgpt');
    expect(cfg.openaiApiKey).toBe('sk-test');
    expect(cfg.openaiChatGptAuth?.accountId).toBe('acct-1');
  });

  it('clears ChatGPT auth without removing the stored API key', async () => {
    const base = path.join(tmpdir(), `f1aire-config-${Date.now()}`);
    setTempConfigHome(base);

    await writeOpenAIApiKey('f1aire', 'sk-test');
    await writeOpenAIChatGptAuth('f1aire', {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: 123456,
      accountId: 'acct-1',
    });

    await clearStoredOpenAIChatGptAuth('f1aire');

    const cfg = await readAppConfig('f1aire');
    expect(cfg.openaiChatGptAuth).toBeUndefined();
    expect(cfg.openaiApiKey).toBe('sk-test');
    expect(cfg.openaiAuthPreference).toBe('chatgpt');
  });
});
