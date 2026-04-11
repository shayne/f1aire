import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import {
  readAppConfig,
  writeOpenAIChatGptAuth,
  type AppConfig,
  type OpenAIChatGptAuthConfig,
} from './config.js';

const CHATGPT_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CHATGPT_ISSUER = 'https://auth.openai.com';
const CHATGPT_BACKEND_BASE_URL = 'https://chatgpt.com/backend-api';
const CHATGPT_ORIGINATOR = 'f1aire';
const CHATGPT_USER_AGENT = 'f1aire/0.1.0';
const CHATGPT_OAUTH_PORT = 1455;
const CHATGPT_OAUTH_TIMEOUT_MS = 5 * 60_000;
const CHATGPT_REFRESH_MARGIN_MS = 30_000;
const CHATGPT_OAUTH_SCOPE =
  'openid profile email offline_access api.connectors.read api.connectors.invoke';

export const CHATGPT_OAUTH_DUMMY_KEY = 'f1aire-chatgpt-oauth-dummy-key';

export type OpenAIApiKeyAuth = {
  kind: 'api-key';
  apiKey: string;
  source: 'env' | 'stored';
};

export type OpenAIChatGptAuth = OpenAIChatGptAuthConfig & {
  kind: 'chatgpt';
};

export type ResolvedOpenAIAuth = OpenAIApiKeyAuth | OpenAIChatGptAuth;

export type OpenAIProviderAuthConfig = {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
};

export type ChatGptJwtClaims = {
  accountId?: string;
  accountEmail?: string;
  planType?: string;
};

type TokenResponse = {
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

type ChatGptOAuthOptions = {
  appName: string;
  issuer?: string;
  clientId?: string;
  port?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  openBrowserImpl?: (url: string) => Promise<void>;
};

type ChatGptOAuthAttempt = {
  authUrl: string;
  waitForCompletion: () => Promise<OpenAIChatGptAuthConfig>;
  cancel: () => Promise<void>;
};

type PkceCodes = {
  verifier: string;
  challenge: string;
};

type PendingOAuth = {
  resolve: (auth: OpenAIChatGptAuthConfig) => void;
  reject: (error: Error) => void;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getDefaultChatGptAuthIssuer(): string {
  return asNonEmptyString(process.env.F1AIRE_CHATGPT_AUTH_ISSUER) ?? CHATGPT_ISSUER;
}

function getDefaultChatGptBackendBaseUrl(): string {
  const override = asNonEmptyString(process.env.F1AIRE_CHATGPT_BASE_URL);
  const base = override ?? CHATGPT_BACKEND_BASE_URL;
  return base.replace(/\/+$/, '');
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function generateRandomToken(byteCount = 32): string {
  return base64UrlEncode(randomBytes(byteCount));
}

function generatePkceCodes(): PkceCodes {
  const verifier = generateRandomToken(64);
  const challenge = base64UrlEncode(
    createHash('sha256').update(verifier).digest(),
  );
  return { verifier, challenge };
}

function buildChatGptAuthorizeUrl({
  issuer,
  clientId,
  redirectUri,
  challenge,
  state,
}: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: CHATGPT_OAUTH_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    state,
    originator: CHATGPT_ORIGINATOR,
  });

  return `${issuer.replace(/\/+$/, '')}/oauth/authorize?${params.toString()}`;
}

function copyHeaders(source?: RequestInit['headers']): Headers {
  const headers = new Headers();
  if (!source) return headers;

  const sourceHeaders = new Headers(source);
  sourceHeaders.forEach((value, key) => {
    if (key.toLowerCase() === 'authorization') return;
    if (key.toLowerCase() === 'chatgpt-account-id') return;
    headers.set(key, value);
  });

  return headers;
}

function renderLoginResultPage({
  title,
  message,
  color,
}: {
  title: string;
  message: string;
  color: string;
}): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeColor = escapeHtml(color);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${safeTitle}</title>
    <style>
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        color: #f6f3f0;
        background: #0f1115;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        max-width: 680px;
        padding: 32px;
        text-align: center;
      }
      h1 {
        color: ${safeColor};
        margin-bottom: 12px;
      }
      p {
        color: #b0b7c3;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
    </main>
    <script>setTimeout(() => window.close(), 1500);</script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtmlResponse(res: ServerResponse, statusCode: number, body: string) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
  });
  res.end(body);
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args =
    process.platform === 'darwin'
      ? [url]
      : process.platform === 'win32'
        ? ['/c', 'start', '', url]
        : [url];

  await new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function sendCancelRequest(port: number): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/cancel`);
  } catch {
    // Ignore failures; the next bind attempt will report the real error.
  }
}

async function listenForOAuthCallback(
  server: Server,
  port: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = async (error: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      if (port > 0 && error.code === 'EADDRINUSE') {
        await sendCancelRequest(port);
        reject(error);
        return;
      }
      reject(error);
    };

    const onListening = () => {
      server.removeListener('error', onError);
      const address = server.address() as AddressInfo | string | null;
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine ChatGPT OAuth callback port.'));
        return;
      }
      resolve(address.port);
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1] ?? '', 'base64url').toString('utf-8'),
    ) as unknown;
    return payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseChatGptJwtClaims(token: string): ChatGptJwtClaims {
  const claims = decodeJwtClaims(token);
  const authClaims =
    claims &&
    typeof claims['https://api.openai.com/auth'] === 'object' &&
    claims['https://api.openai.com/auth'] !== null
      ? (claims['https://api.openai.com/auth'] as Record<string, unknown>)
      : null;
  const profileClaims =
    claims &&
    typeof claims['https://api.openai.com/profile'] === 'object' &&
    claims['https://api.openai.com/profile'] !== null
      ? (claims['https://api.openai.com/profile'] as Record<string, unknown>)
      : null;
  const accountId =
    asNonEmptyString(authClaims?.chatgpt_account_id) ??
    asNonEmptyString(claims?.chatgpt_account_id) ??
    asNonEmptyString(
      Array.isArray(claims?.organizations)
        ? (claims.organizations[0] as any)?.id
        : undefined,
    ) ??
    undefined;
  const accountEmail =
    asNonEmptyString(claims?.email) ??
    asNonEmptyString(profileClaims?.email) ??
    undefined;
  const planType =
    asNonEmptyString(authClaims?.chatgpt_plan_type) ??
    asNonEmptyString(claims?.chatgpt_plan_type) ??
    undefined;

  return {
    ...(accountId ? { accountId } : {}),
    ...(accountEmail ? { accountEmail } : {}),
    ...(planType ? { planType: planType.toLowerCase() } : {}),
  };
}

function normalizeChatGptTokenResponse(
  tokens: TokenResponse,
  fallbackAuth?: OpenAIChatGptAuthConfig,
): OpenAIChatGptAuthConfig {
  const tokenClaims = tokens.id_token
    ? parseChatGptJwtClaims(tokens.id_token)
    : {};
  const accessClaims = parseChatGptJwtClaims(tokens.access_token);
  const accountId =
    tokenClaims.accountId ?? accessClaims.accountId ?? fallbackAuth?.accountId;
  const accountEmail =
    tokenClaims.accountEmail ??
    accessClaims.accountEmail ??
    fallbackAuth?.accountEmail;
  const planType =
    tokenClaims.planType ?? accessClaims.planType ?? fallbackAuth?.planType;

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? fallbackAuth?.refreshToken ?? '',
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ...(accountId ? { accountId } : {}),
    ...(accountEmail ? { accountEmail } : {}),
    ...(planType ? { planType } : {}),
  };
}

async function requestChatGptTokens({
  issuer,
  fetchImpl,
  body,
  requireIdToken = true,
  requireRefreshToken = true,
}: {
  issuer: string;
  fetchImpl: typeof fetch;
  body: URLSearchParams;
  requireIdToken?: boolean;
  requireRefreshToken?: boolean;
}): Promise<TokenResponse> {
  const response = await fetchImpl(`${issuer.replace(/\/+$/, '')}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      responseText.trim()
        ? `Token exchange failed: HTTP ${response.status} ${responseText.trim()}`
        : `Token exchange failed: HTTP ${response.status}`,
    );
  }

  const parsed = JSON.parse(responseText) as Partial<TokenResponse>;
  const idToken = asNonEmptyString(parsed.id_token);
  const accessToken = asNonEmptyString(parsed.access_token);
  const refreshToken = asNonEmptyString(parsed.refresh_token);
  if (
    !accessToken ||
    (requireIdToken && !idToken) ||
    (requireRefreshToken && !refreshToken)
  ) {
    throw new Error('Token exchange returned an incomplete token payload.');
  }

  return {
    access_token: accessToken,
    ...(idToken ? { id_token: idToken } : {}),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
    ...(typeof parsed.expires_in === 'number' &&
    Number.isFinite(parsed.expires_in)
      ? { expires_in: parsed.expires_in }
      : {}),
  };
}

export async function refreshOpenAIChatGptAuth(
  appName: string,
  currentAuth: OpenAIChatGptAuthConfig,
  {
    issuer = getDefaultChatGptAuthIssuer(),
    clientId = CHATGPT_CLIENT_ID,
    fetchImpl = fetch,
  }: {
    issuer?: string;
    clientId?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<OpenAIChatGptAuthConfig> {
  const tokens = await requestChatGptTokens({
    issuer,
    fetchImpl,
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: currentAuth.refreshToken,
      client_id: clientId,
    }),
    requireIdToken: false,
    requireRefreshToken: false,
  });
  const nextAuth = normalizeChatGptTokenResponse(tokens, currentAuth);
  await writeOpenAIChatGptAuth(appName, nextAuth);
  return nextAuth;
}

export async function resolveOpenAIAuthForUse(
  appName: string,
  {
    config,
    fetchImpl = fetch,
    issuer = getDefaultChatGptAuthIssuer(),
    clientId = CHATGPT_CLIENT_ID,
    nowMs = Date.now(),
  }: {
    config?: AppConfig;
    fetchImpl?: typeof fetch;
    issuer?: string;
    clientId?: string;
    nowMs?: number;
  } = {},
): Promise<ResolvedOpenAIAuth | null> {
  const loadedConfig = config ?? (await readAppConfig(appName));
  const envApiKey = asNonEmptyString(process.env.OPENAI_API_KEY);
  const preference = loadedConfig.openaiAuthPreference ?? 'chatgpt';

  if (preference === 'api-key') {
    if (envApiKey) {
      return {
        kind: 'api-key',
        apiKey: envApiKey,
        source: 'env',
      };
    }
    if (loadedConfig.openaiApiKey) {
      return {
        kind: 'api-key',
        apiKey: loadedConfig.openaiApiKey,
        source: 'stored',
      };
    }
    return null;
  }

  const chatGptAuth = loadedConfig.openaiChatGptAuth;
  if (!chatGptAuth) {
    return null;
  }

  if (chatGptAuth.expiresAt <= nowMs + CHATGPT_REFRESH_MARGIN_MS) {
    const refreshed = await refreshOpenAIChatGptAuth(appName, chatGptAuth, {
      issuer,
      clientId,
      fetchImpl,
    });
    return {
      kind: 'chatgpt',
      ...refreshed,
    };
  }

  return {
    kind: 'chatgpt',
    ...chatGptAuth,
  };
}

export function createOpenAIProviderAuthConfig({
  appName,
  auth,
  issuer = getDefaultChatGptAuthIssuer(),
  clientId = CHATGPT_CLIENT_ID,
  backendBaseUrl = getDefaultChatGptBackendBaseUrl(),
  fetchImpl = fetch,
}: {
  appName: string;
  auth: ResolvedOpenAIAuth;
  issuer?: string;
  clientId?: string;
  backendBaseUrl?: string;
  fetchImpl?: typeof fetch;
}): OpenAIProviderAuthConfig {
  if (auth.kind === 'api-key') {
    return {
      apiKey: auth.apiKey,
    };
  }

  let activeAuth: OpenAIChatGptAuthConfig = { ...auth };

  return {
    apiKey: CHATGPT_OAUTH_DUMMY_KEY,
    baseURL: `${backendBaseUrl.replace(/\/+$/, '')}/codex`,
    fetch: async (requestInfo, init) => {
      if (activeAuth.expiresAt <= Date.now() + CHATGPT_REFRESH_MARGIN_MS) {
        activeAuth = await refreshOpenAIChatGptAuth(appName, activeAuth, {
          issuer,
          clientId,
          fetchImpl,
        });
      }

      const headers = copyHeaders(init?.headers);
      headers.set('Authorization', `Bearer ${activeAuth.accessToken}`);
      if (!headers.has('originator')) {
        headers.set('originator', CHATGPT_ORIGINATOR);
      }
      if (!headers.has('User-Agent')) {
        headers.set('User-Agent', CHATGPT_USER_AGENT);
      }
      if (activeAuth.accountId) {
        headers.set('ChatGPT-Account-Id', activeAuth.accountId);
      }

      return fetchImpl(requestInfo, {
        ...init,
        headers,
      });
    },
  };
}

export function getTeamRadioOpenAIAuthRequestConfig(
  auth: ResolvedOpenAIAuth | null,
  {
    backendBaseUrl = getDefaultChatGptBackendBaseUrl(),
  }: {
    backendBaseUrl?: string;
  } = {},
): {
  bearerToken: string | null;
  chatGptAccountId?: string;
  apiBase?: string;
  chatGptTranscription: boolean;
} {
  if (!auth) {
    return {
      bearerToken: null,
      chatGptTranscription: false,
    };
  }

  if (auth.kind === 'api-key') {
    return {
      bearerToken: auth.apiKey,
      chatGptTranscription: false,
    };
  }

  return {
    bearerToken: auth.accessToken,
    chatGptTranscription: true,
    apiBase: backendBaseUrl.replace(/\/+$/, ''),
    ...(auth.accountId ? { chatGptAccountId: auth.accountId } : {}),
  };
}

export async function startChatGptOpenAIAuth(
  {
    appName,
    issuer = getDefaultChatGptAuthIssuer(),
    clientId = CHATGPT_CLIENT_ID,
    port = CHATGPT_OAUTH_PORT,
    timeoutMs = CHATGPT_OAUTH_TIMEOUT_MS,
    fetchImpl = fetch,
    openBrowserImpl = defaultOpenBrowser,
  }: ChatGptOAuthOptions,
): Promise<ChatGptOAuthAttempt> {
  const pkce = generatePkceCodes();
  const state = generateRandomToken();
  let oauthServer: Server | null = null;
  let settled = false;
  let pendingOAuth: PendingOAuth | null = null;

  const waitForCompletion = new Promise<OpenAIChatGptAuthConfig>(
    (resolve, reject) => {
      pendingOAuth = {
        resolve: (auth) => {
          if (settled) return;
          settled = true;
          resolve(auth);
        },
        reject: (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        },
      };
    },
  );

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/cancel') {
      sendHtmlResponse(
        res,
        200,
        renderLoginResultPage({
          title: 'ChatGPT sign-in cancelled',
          message: 'You can close this tab and return to f1aire.',
          color: '#f6c177',
        }),
      );
      pendingOAuth?.reject(new Error('ChatGPT login was cancelled.'));
      return;
    }

    if (url.pathname !== '/auth/callback') {
      sendHtmlResponse(
        res,
        404,
        renderLoginResultPage({
          title: 'Unknown callback path',
          message: 'Return to f1aire and restart ChatGPT sign-in.',
          color: '#f38ba8',
        }),
      );
      return;
    }

    const callbackState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (callbackState !== state) {
      sendHtmlResponse(
        res,
        400,
        renderLoginResultPage({
          title: 'ChatGPT sign-in failed',
          message: 'Invalid OAuth state. Return to f1aire and try again.',
          color: '#f38ba8',
        }),
      );
      pendingOAuth?.reject(new Error('Invalid OAuth state.'));
      return;
    }

    if (error) {
      const message = errorDescription ?? error;
      sendHtmlResponse(
        res,
        400,
        renderLoginResultPage({
          title: 'ChatGPT sign-in failed',
          message,
          color: '#f38ba8',
        }),
      );
      pendingOAuth?.reject(new Error(message));
      return;
    }

    if (!code) {
      sendHtmlResponse(
        res,
        400,
        renderLoginResultPage({
          title: 'ChatGPT sign-in failed',
          message: 'Missing authorization code.',
          color: '#f38ba8',
        }),
      );
      pendingOAuth?.reject(new Error('Missing authorization code.'));
      return;
    }

    void (async () => {
      try {
        const callbackPortAddress = server.address();
        const callbackPort =
          callbackPortAddress && typeof callbackPortAddress !== 'string'
            ? callbackPortAddress.port
            : port;
        const callbackRedirectUri = `http://localhost:${callbackPort}/auth/callback`;
        const tokens = await requestChatGptTokens({
          issuer,
          fetchImpl,
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackRedirectUri,
            client_id: clientId,
            code_verifier: pkce.verifier,
          }),
        });
        const auth = normalizeChatGptTokenResponse(tokens);
        await writeOpenAIChatGptAuth(appName, auth);
        sendHtmlResponse(
          res,
          200,
          renderLoginResultPage({
            title: 'ChatGPT sign-in complete',
            message: 'You can close this tab and return to f1aire.',
            color: '#a6e3a1',
          }),
        );
        pendingOAuth?.resolve(auth);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        sendHtmlResponse(
          res,
          400,
          renderLoginResultPage({
            title: 'ChatGPT sign-in failed',
            message: error.message,
            color: '#f38ba8',
          }),
        );
        pendingOAuth?.reject(error);
      }
    })();
  });

  const attempts = port > 0 ? 10 : 1;
  let actualPort = port;
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      actualPort = await listenForOAuthCallback(server, port);
      oauthServer = server;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        attempt === attempts - 1 ||
        (err as NodeJS.ErrnoException | undefined)?.code !== 'EADDRINUSE'
      ) {
        throw lastError;
      }
      await delay(200);
    }
  }

  const redirectUri = `http://localhost:${actualPort}/auth/callback`;
  const authUrl = buildChatGptAuthorizeUrl({
    issuer,
    clientId,
    redirectUri,
    challenge: pkce.challenge,
    state,
  });

  void openBrowserImpl(authUrl).catch(() => {});

  const completionPromise = Promise.race([
    waitForCompletion,
    delay(timeoutMs).then(() => {
      throw new Error('ChatGPT login timed out.');
    }),
  ]).finally(async () => {
    if (oauthServer) {
      const serverToClose = oauthServer;
      oauthServer = null;
      await closeServer(serverToClose);
    }
  });
  void completionPromise.catch(() => {});

  return {
    authUrl,
    waitForCompletion: () => completionPromise,
    cancel: async () => {
      if (settled) return;
      try {
        await sendCancelRequest(actualPort);
      } finally {
        pendingOAuth?.reject(new Error('ChatGPT login was cancelled.'));
      }
      await completionPromise.catch(() => {});
    },
  };
}
