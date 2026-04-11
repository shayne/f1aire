import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAppConfig, writeOpenAIApiKey } from './config.js';
import {
  CHATGPT_OAUTH_DUMMY_KEY,
  createOpenAIProviderAuthConfig,
  parseChatGptJwtClaims,
  refreshOpenAIChatGptAuth,
  resolveOpenAIAuthForUse,
  startChatGptOpenAIAuth,
} from './openai-auth.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function setTempConfigHome(base: string) {
  process.env.XDG_CONFIG_HOME = base;
  process.env.APPDATA = base;
  process.env.HOME = base;
}

function makeJwt(payload: unknown): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.${encode('sig')}`;
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf-8');
  }
  return body;
}

function writeJsonResponse(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

describe('openai auth', () => {
  it('parses ChatGPT account claims from namespaced JWT fields', () => {
    const claims = parseChatGptJwtClaims(
      makeJwt({
        email: 'user@example.com',
        'https://api.openai.com/auth': {
          chatgpt_account_id: 'acct-chatgpt',
          chatgpt_plan_type: 'PLUS',
        },
      }),
    );

    expect(claims).toEqual({
      accountEmail: 'user@example.com',
      accountId: 'acct-chatgpt',
      planType: 'plus',
    });
  });

  it('prefers ChatGPT by default and only uses env API keys when api-key preference is explicit', async () => {
    const base = path.join(tmpdir(), `f1aire-openai-auth-${Date.now()}`);
    setTempConfigHome(base);
    process.env.OPENAI_API_KEY = 'sk-env-test';

    await expect(resolveOpenAIAuthForUse('f1aire')).resolves.toBeNull();

    await writeOpenAIApiKey('f1aire', 'sk-stored-test');

    await expect(resolveOpenAIAuthForUse('f1aire')).resolves.toEqual({
      kind: 'api-key',
      apiKey: 'sk-env-test',
      source: 'env',
    });
  });

  it('injects ChatGPT OAuth headers and Codex backend routing for model requests', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const config = createOpenAIProviderAuthConfig({
      appName: 'f1aire',
      auth: {
        kind: 'chatgpt',
        accessToken: 'chatgpt-access-token',
        refreshToken: 'refresh-token',
        expiresAt: Date.now() + 3600_000,
        accountId: 'acct-chatgpt',
      },
      backendBaseUrl: 'https://chatgpt.com/backend-api',
      fetchImpl,
    });

    expect(config.apiKey).toBe(CHATGPT_OAUTH_DUMMY_KEY);
    expect(config.baseURL).toBe('https://chatgpt.com/backend-api/codex');

    await expect(
      config.fetch?.('https://chatgpt.com/backend-api/codex/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer stale',
          'ChatGPT-Account-Id': 'old-account',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: 'hello' }),
      }),
    ).resolves.toBeInstanceOf(Response);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://chatgpt.com/backend-api/codex/responses',
      expect.objectContaining({
        headers: expect.any(Headers),
        method: 'POST',
      }),
    );
    const headers = fetchImpl.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer chatgpt-access-token');
    expect(headers.get('ChatGPT-Account-Id')).toBe('acct-chatgpt');
    expect(headers.get('originator')).toBe('f1aire');
    expect(headers.get('User-Agent')).toBe('f1aire/0.1.0');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('completes a local OAuth callback and stores ChatGPT tokens', async () => {
    const base = path.join(tmpdir(), `f1aire-openai-auth-callback-${Date.now()}`);
    setTempConfigHome(base);

    const issuerServer = createServer(async (req, res) => {
      if (req.url !== '/oauth/token') {
        writeJsonResponse(res, 404, { error: 'not_found' });
        return;
      }

      const form = new URLSearchParams(await readRequestBody(req));
      expect(form.get('grant_type')).toBe('authorization_code');
      expect(form.get('code')).toBe('test-auth-code');
      expect(form.get('client_id')).toBe('app_EMoamEEZ73f0CkXaXp7hrann');
      expect(form.get('code_verifier')).toBeTruthy();
      expect(form.get('redirect_uri')).toMatch(
        /^http:\/\/localhost:\d+\/auth\/callback$/,
      );

      writeJsonResponse(res, 200, {
        id_token: makeJwt({
          email: 'user@example.com',
          'https://api.openai.com/auth': {
            chatgpt_account_id: 'acct-chatgpt',
            chatgpt_plan_type: 'PLUS',
          },
        }),
        access_token: 'chatgpt-access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      });
    });

    await new Promise<void>((resolve) => {
      issuerServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = issuerServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('issuer server did not expose a port');
    }

    const attempt = await startChatGptOpenAIAuth({
      appName: 'f1aire',
      issuer: `http://127.0.0.1:${address.port}`,
      port: 0,
      openBrowserImpl: vi.fn(async () => {}),
    });
    const callbackUrl = new URL(attempt.authUrl);
    const redirectUri = callbackUrl.searchParams.get('redirect_uri');
    const state = callbackUrl.searchParams.get('state');
    expect(redirectUri).toBeTruthy();
    expect(state).toBeTruthy();

    await fetch(
      `${redirectUri}?code=test-auth-code&state=${encodeURIComponent(state ?? '')}`,
    );

    await expect(attempt.waitForCompletion()).resolves.toMatchObject({
      accessToken: 'chatgpt-access-token',
      refreshToken: 'refresh-token',
      accountId: 'acct-chatgpt',
      accountEmail: 'user@example.com',
      planType: 'plus',
    });

    await expect(readAppConfig('f1aire')).resolves.toMatchObject({
      openaiAuthPreference: 'chatgpt',
      openaiChatGptAuth: {
        accessToken: 'chatgpt-access-token',
        refreshToken: 'refresh-token',
        accountId: 'acct-chatgpt',
        accountEmail: 'user@example.com',
        planType: 'plus',
      },
    });

    await new Promise<void>((resolve) => issuerServer.close(() => resolve()));
  });

  it('preserves prior ChatGPT account metadata and refresh token when refresh omits optional token fields', async () => {
    const base = path.join(tmpdir(), `f1aire-openai-refresh-${Date.now()}`);
    setTempConfigHome(base);

    const refreshFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'new-access-token',
          expires_in: 7200,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    await expect(
      refreshOpenAIChatGptAuth(
        'f1aire',
        {
          accessToken: 'old-access-token',
          refreshToken: 'old-refresh-token',
          expiresAt: Date.now() - 1000,
          accountId: 'acct-existing',
          accountEmail: 'user@example.com',
          planType: 'pro',
        },
        {
          issuer: 'https://auth.openai.com',
          fetchImpl: refreshFetch,
        },
      ),
    ).resolves.toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'old-refresh-token',
      accountId: 'acct-existing',
      accountEmail: 'user@example.com',
      planType: 'pro',
    });

    await expect(readAppConfig('f1aire')).resolves.toMatchObject({
      openaiAuthPreference: 'chatgpt',
      openaiChatGptAuth: {
        accessToken: 'new-access-token',
        refreshToken: 'old-refresh-token',
        accountId: 'acct-existing',
        accountEmail: 'user@example.com',
        planType: 'pro',
      },
    });
  });

  it('returns an OAuth callback error page when token exchange fails', async () => {
    const base = path.join(
      tmpdir(),
      `f1aire-openai-auth-callback-error-${Date.now()}`,
    );
    setTempConfigHome(base);

    const issuerServer = createServer((req, res) => {
      if (req.url !== '/oauth/token') {
        writeJsonResponse(res, 404, { error: 'not_found' });
        return;
      }

      writeJsonResponse(res, 401, {
        error: 'invalid_grant',
        error_description: 'Expired authorization code.',
      });
    });

    await new Promise<void>((resolve) => {
      issuerServer.listen(0, '127.0.0.1', () => resolve());
    });

    const address = issuerServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('issuer server did not expose a port');
    }

    const attempt = await startChatGptOpenAIAuth({
      appName: 'f1aire',
      issuer: `http://127.0.0.1:${address.port}`,
      port: 0,
      openBrowserImpl: vi.fn(async () => {}),
    });
    const callbackUrl = new URL(attempt.authUrl);
    const redirectUri = callbackUrl.searchParams.get('redirect_uri');
    const state = callbackUrl.searchParams.get('state');
    expect(redirectUri).toBeTruthy();
    expect(state).toBeTruthy();

    const callbackResponse = await fetch(
      `${redirectUri}?code=test-auth-code&state=${encodeURIComponent(state ?? '')}`,
    );
    await expect(callbackResponse.text()).resolves.toContain(
      'ChatGPT sign-in failed',
    );

    await expect(attempt.waitForCompletion()).rejects.toThrow(
      'Token exchange failed: HTTP 401',
    );

    await new Promise<void>((resolve) => issuerServer.close(() => resolve()));
  });
});
