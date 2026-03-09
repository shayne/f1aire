import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  BestLapsResponse,
  CurrentTyresResponse,
  OperatorApi,
  PositionSnapshotResponse,
  ReplayControlRequest,
  ReplayControlResult,
  SessionLifecycleOrder,
  SessionLifecycleResponse,
  TeamRadioDownloadRequest,
  TeamRadioEventsResponse,
  TeamRadioPlaybackRequest,
  TeamRadioTranscriptionRequest,
  TimingLapResponse,
  TyreStintsResponse,
} from './operator-api.js';

type JsonObject = Record<string, unknown>;

export type OperatorApiServer = {
  server: Server;
  origin: string;
  close: () => Promise<void>;
};

export type OperatorApiRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

type BestLapQuery = {
  driverNumber?: string;
  limit?: number;
  includeSnapshot?: boolean;
};

type TeamRadioQuery = {
  driverNumber?: string;
  limit?: number;
};

type TeamRadioErrorResponse = {
  statusCode: number;
  errorCode: string;
  errorMessage: string;
};

type TyreQuery = {
  driverNumber?: string;
};

type PositionSnapshotQuery = {
  driverNumber?: string;
};

type SessionLifecycleQuery = {
  includeFuture?: boolean;
  limit?: number;
  order?: SessionLifecycleOrder;
};

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    ...JSON_HEADERS,
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(
  res: ServerResponse,
  statusCode: number,
  errorCode: string,
  errorMessage: string,
) {
  sendJson(res, statusCode, { errorCode, errorMessage });
}

function parseOptionalInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.trunc(parsed);
}

function parseOptionalBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false;
  }
  return undefined;
}

function parseOptionalOrder(
  value: string | null,
): SessionLifecycleOrder | undefined {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'asc' || normalized === 'desc') {
    return normalized;
  }

  return undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<JsonObject | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) {
    return null;
  }

  const parsed: unknown = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as JsonObject)
    : null;
}

function classifyTeamRadioError(error: unknown): TeamRadioErrorResponse {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  if (/No matching team radio capture was found\./i.test(errorMessage)) {
    return {
      statusCode: 404,
      errorCode: 'not-found',
      errorMessage,
    };
  }

  if (/does not have a downloadable asset URL\./i.test(errorMessage)) {
    return {
      statusCode: 400,
      errorCode: 'invalid-request',
      errorMessage,
    };
  }

  if (
    /OpenAI API key is required to transcribe team radio clips\./i.test(
      errorMessage,
    )
  ) {
    return {
      statusCode: 400,
      errorCode: 'invalid-request',
      errorMessage,
    };
  }

  return {
    statusCode: 500,
    errorCode: 'internal-error',
    errorMessage,
  };
}

function handleTimingLap(
  api: OperatorApi,
  url: URL,
  lapNumber: string,
): TimingLapResponse | null {
  const lap = Number(lapNumber);
  if (!Number.isFinite(lap)) {
    return null;
  }
  const driverNumber = url.searchParams.get('driverNumber') ?? undefined;
  return api.getTimingLap({ lap, ...(driverNumber ? { driverNumber } : {}) });
}

function handleBestLaps(api: OperatorApi, url: URL): BestLapsResponse {
  const options: BestLapQuery = {};
  const driverNumber = url.searchParams.get('driverNumber');
  if (driverNumber) {
    options.driverNumber = driverNumber;
  }
  const limit = parseOptionalInt(url.searchParams.get('limit'));
  if (typeof limit === 'number') {
    options.limit = limit;
  }
  const includeSnapshot = parseOptionalBoolean(
    url.searchParams.get('includeSnapshot'),
  );
  if (typeof includeSnapshot === 'boolean') {
    options.includeSnapshot = includeSnapshot;
  }
  return api.getBestLaps(options);
}

function handleTeamRadioEvents(
  api: OperatorApi,
  url: URL,
): TeamRadioEventsResponse {
  const options: TeamRadioQuery = {};
  const driverNumber = url.searchParams.get('driverNumber');
  if (driverNumber) {
    options.driverNumber = driverNumber;
  }
  const limit = parseOptionalInt(url.searchParams.get('limit'));
  if (typeof limit === 'number') {
    options.limit = limit;
  }
  return api.getTeamRadioEvents(options);
}

function handleCurrentTyres(api: OperatorApi, url: URL): CurrentTyresResponse {
  const options: TyreQuery = {};
  const driverNumber = url.searchParams.get('driverNumber');
  if (driverNumber) {
    options.driverNumber = driverNumber;
  }
  return api.getCurrentTyres(options);
}

function handleTyreStints(api: OperatorApi, url: URL): TyreStintsResponse {
  const options: TyreQuery = {};
  const driverNumber = url.searchParams.get('driverNumber');
  if (driverNumber) {
    options.driverNumber = driverNumber;
  }
  return api.getTyreStints(options);
}

function handlePositionSnapshot(
  api: OperatorApi,
  url: URL,
): PositionSnapshotResponse | null {
  const options: PositionSnapshotQuery = {};
  const driverNumber = url.searchParams.get('driverNumber');
  if (driverNumber) {
    options.driverNumber = driverNumber;
  }
  return api.getPositionSnapshot(options);
}

function handleSessionLifecycle(
  api: OperatorApi,
  url: URL,
): SessionLifecycleResponse {
  const options: SessionLifecycleQuery = {};
  const includeFuture = parseOptionalBoolean(
    url.searchParams.get('includeFuture'),
  );
  if (typeof includeFuture === 'boolean') {
    options.includeFuture = includeFuture;
  }
  const limit = parseOptionalInt(url.searchParams.get('limit'));
  if (typeof limit === 'number') {
    options.limit = limit;
  }
  const order = parseOptionalOrder(url.searchParams.get('order'));
  if (order) {
    options.order = order;
  }
  return api.getSessionLifecycle(options);
}

function applyControl(
  api: OperatorApi,
  request: JsonObject,
): ReplayControlResult {
  return api.applyControl(request as ReplayControlRequest);
}

export function createOperatorApiRequestHandler(opts: {
  api: OperatorApi;
}): OperatorApiRequestHandler {
  const { api } = opts;

  return async (req, res) => {
    try {
      const method = (req.method ?? 'GET').toUpperCase();
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const segments = url.pathname.split('/').filter(Boolean);

      if (
        method === 'GET' &&
        segments.length === 1 &&
        segments[0] === 'control'
      ) {
        sendJson(res, 200, api.getControlState());
        return;
      }

      if (
        method === 'POST' &&
        segments.length === 1 &&
        segments[0] === 'control'
      ) {
        let body: JsonObject | null = null;
        try {
          body = await readJsonBody(req);
        } catch {
          sendError(
            res,
            400,
            'invalid-request',
            'Request body must be valid JSON.',
          );
          return;
        }
        if (!body) {
          sendError(
            res,
            400,
            'invalid-request',
            'Request body must be a JSON object.',
          );
          return;
        }
        const result = applyControl(api, body);
        if (!result.ok) {
          sendJson(res, 400, result.error);
          return;
        }
        sendJson(res, 200, result.value);
        return;
      }

      if (
        method === 'POST' &&
        segments.length === 3 &&
        segments[0] === 'data' &&
        segments[1] === 'TeamRadio' &&
        (segments[2] === 'download' ||
          segments[2] === 'play' ||
          segments[2] === 'transcribe')
      ) {
        let body: JsonObject = {};
        try {
          body = (await readJsonBody(req)) ?? {};
        } catch {
          sendError(
            res,
            400,
            'invalid-request',
            'Request body must be valid JSON.',
          );
          return;
        }

        try {
          if (segments[2] === 'download') {
            const result = await api.downloadTeamRadioCapture(
              body as TeamRadioDownloadRequest,
            );
            sendJson(res, 200, result);
            return;
          }

          if (segments[2] === 'transcribe') {
            const result = await api.transcribeTeamRadioCapture(
              body as TeamRadioTranscriptionRequest,
            );
            sendJson(res, 200, result);
            return;
          }

          const result = await api.playTeamRadioCapture(
            body as TeamRadioPlaybackRequest,
          );
          sendJson(res, 200, result);
          return;
        } catch (error) {
          const classified = classifyTeamRadioError(error);
          sendError(
            res,
            classified.statusCode,
            classified.errorCode,
            classified.errorMessage,
          );
          return;
        }
      }

      if (method === 'GET' && segments.length === 3 && segments[0] === 'data') {
        const topic = decodeURIComponent(segments[1]!);
        if (topic === 'TeamRadio' && segments[2] === 'events') {
          sendJson(res, 200, handleTeamRadioEvents(api, url));
          return;
        }
        if (topic === 'CurrentTyres' && segments[2] === 'current') {
          sendJson(res, 200, handleCurrentTyres(api, url));
          return;
        }
        if (topic === 'TyreStintSeries' && segments[2] === 'stints') {
          sendJson(res, 200, handleTyreStints(api, url));
          return;
        }
        if (topic === 'Position' && segments[2] === 'snapshot') {
          const snapshot = handlePositionSnapshot(api, url);
          if (!snapshot) {
            sendError(
              res,
              404,
              'not-found',
              'Position snapshot was not found.',
            );
            return;
          }
          sendJson(res, 200, snapshot);
          return;
        }
        if (topic === 'SessionLifecycle' && segments[2] === 'events') {
          sendJson(res, 200, handleSessionLifecycle(api, url));
          return;
        }
        if (segments[2] === 'latest') {
          const snapshot = api.getLatest(topic);
          if (!snapshot) {
            sendError(res, 404, 'not-found', 'Topic snapshot was not found.');
            return;
          }
          sendJson(res, 200, snapshot);
          return;
        }
      }

      if (method === 'GET' && segments.length === 4 && segments[0] === 'data') {
        if (
          segments[1] === 'TimingData' &&
          segments[2] === 'laps' &&
          segments[3] === 'best'
        ) {
          sendJson(res, 200, handleBestLaps(api, url));
          return;
        }
        if (segments[1] === 'TimingData' && segments[2] === 'laps') {
          const response = handleTimingLap(api, url, segments[3]!);
          if (!response) {
            sendError(
              res,
              404,
              'not-found',
              'Timing lap snapshot was not found.',
            );
            return;
          }
          sendJson(res, 200, response);
          return;
        }
      }

      sendError(res, 404, 'not-found', 'Endpoint not found.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendError(res, 500, 'internal-error', message);
    }
  };
}

export async function startOperatorApiServer(opts: {
  api: OperatorApi;
  hostname?: string;
  port?: number;
}): Promise<OperatorApiServer> {
  const hostname = opts.hostname ?? '127.0.0.1';
  const port = opts.port ?? 0;
  const server = createServer(
    createOperatorApiRequestHandler({ api: opts.api }),
  );

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not resolve operator API server address.');
  }

  return {
    server,
    origin: `http://${hostname}:${(address as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
