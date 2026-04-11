import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  execFile,
  spawn,
  type ExecFileException,
  type ExecFileOptions,
} from 'node:child_process';
import { tmpdir } from 'node:os';
import type { SessionStore } from './session-store.js';
import { getDataDir } from './xdg.js';

const STATIC_BASE_URL = 'https://livetiming.formula1.com/static/';
const DEFAULT_OPENAI_API_BASE = 'https://api.openai.com/v1';
const USER_AGENT = 'f1aire/0.1.0';
const FETCH_TIMEOUT_MS = 10_000;
const TRANSCRIPTION_TIMEOUT_MS = 60_000;
const DEFAULT_APP_NAME = 'f1aire';
const TEAM_RADIO_CACHE_DIR = 'team-radio';
const TEAM_RADIO_TRANSCRIPTION_CACHE_SUFFIX = '.transcription.json';
const DEFAULT_TEAM_RADIO_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const DEFAULT_LOCAL_TEAM_RADIO_TRANSCRIPTION_COMMAND = 'whisper';
const DEFAULT_LOCAL_TEAM_RADIO_TRANSCRIPTION_MODEL = 'base';

export const TEAM_RADIO_TRANSCRIPTION_BACKENDS = ['openai', 'local'] as const;

export type TeamRadioTranscriptionBackend =
  (typeof TEAM_RADIO_TRANSCRIPTION_BACKENDS)[number];

export const TEAM_RADIO_PLAYERS = [
  'system',
  'afplay',
  'ffplay',
  'mpv',
  'vlc',
] as const;

export type TeamRadioPlayer = (typeof TEAM_RADIO_PLAYERS)[number];

type ObjectRecord = Record<string, unknown>;

type SessionRawLike = Pick<
  SessionStore['raw'],
  'download' | 'subscribe' | 'keyframes'
>;

export type TeamRadioCapture = {
  Utc?: string;
  RacingNumber?: string;
  Path?: string;
  DownloadedFilePath?: string;
  Transcription?: string;
};

export type TeamRadioState = {
  Captures?: Record<string, TeamRadioCapture> | TeamRadioCapture[];
};

export type TeamRadioCaptureSummary = {
  captureId: string;
  utc: string | null;
  driverNumber: string | null;
  path: string | null;
  assetUrl: string | null;
  downloadedFilePath: string | null;
  hasTranscription: boolean;
};

export type TeamRadioDownloadResult = TeamRadioCaptureSummary & {
  filePath: string;
  bytes: number;
  reused: boolean;
  sessionPrefix: string | null;
  destinationDir: string;
};

export type TeamRadioTranscriptionResult = TeamRadioDownloadResult & {
  backend: TeamRadioTranscriptionBackend;
  transcription: string;
  transcriptionFilePath: string;
  transcriptionReused: boolean;
  model: string;
};

export type TeamRadioPlaybackCommand = {
  player: TeamRadioPlayer;
  command: string;
  args: string[];
  detached: boolean;
  shell: boolean;
};

export type TeamRadioPlaybackResult = TeamRadioDownloadResult & {
  player: TeamRadioPlayer;
  command: string;
  args: string[];
  pid: number | null;
};

type TeamRadioTranscriptionCache = {
  text: string;
  model: string;
  createdAt: string;
  backend: TeamRadioTranscriptionBackend;
};

type TeamRadioSpawnOptions = {
  stdio: 'ignore';
  detached: boolean;
  shell: boolean;
};

type TeamRadioSpawnedProcess = {
  pid?: number;
  once?: (event: string, listener: (...args: unknown[]) => void) => unknown;
  unref?: () => void;
};

type TeamRadioExecFileOptions = Pick<ExecFileOptions, 'timeout' | 'maxBuffer'>;

type TeamRadioExecFileCallback = (
  error: ExecFileException | null,
  stdout: string,
  stderr: string,
) => void;

export type TeamRadioExecFileImpl = (
  file: string,
  args: string[],
  options: TeamRadioExecFileOptions,
  callback: TeamRadioExecFileCallback,
) => unknown;

type TeamRadioSpawnImpl = (
  command: string,
  args: string[],
  options: TeamRadioSpawnOptions,
) => TeamRadioSpawnedProcess;

function isPlainObject(value: unknown): value is ObjectRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function asObject(value: unknown): ObjectRecord | null {
  return isPlainObject(value) ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTranscriptionBackend(
  value: unknown,
): TeamRadioTranscriptionBackend | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  return normalized === 'openai' || normalized === 'local' ? normalized : null;
}

function resolveTranscriptionBackend(opts: {
  backend?: TeamRadioTranscriptionBackend;
}): TeamRadioTranscriptionBackend {
  if (opts.backend) {
    return opts.backend;
  }

  const envBackend = normalizeTranscriptionBackend(
    process.env.F1AIRE_TEAM_RADIO_TRANSCRIPTION_BACKEND,
  );
  if (envBackend) {
    return envBackend;
  }

  return 'openai';
}

function getDefaultTranscriptionModel(
  backend: TeamRadioTranscriptionBackend,
): string {
  if (backend === 'local') {
    return (
      asNonEmptyString(
        process.env.F1AIRE_TEAM_RADIO_LOCAL_TRANSCRIPTION_MODEL,
      ) ?? DEFAULT_LOCAL_TEAM_RADIO_TRANSCRIPTION_MODEL
    );
  }

  return (
    asNonEmptyString(process.env.OPENAI_AUDIO_TRANSCRIPTION_MODEL) ??
    DEFAULT_TEAM_RADIO_TRANSCRIPTION_MODEL
  );
}

function normalizeStaticPrefix(value: unknown): string | null {
  const prefix = asNonEmptyString(value);
  if (!prefix) {
    return null;
  }

  if (/^https?:\/\//i.test(prefix)) {
    return prefix.endsWith('/') ? prefix : `${prefix}/`;
  }

  const normalized = prefix.replace(/^\/+/, '');
  return `${STATIC_BASE_URL}${normalized.endsWith('/') ? normalized : `${normalized}/`}`;
}

function getSessionRaw(value: unknown): SessionRawLike | null {
  const source = asObject(value);
  if (!source) {
    return null;
  }

  const raw = asObject(source.raw);
  if (raw) {
    return raw as SessionRawLike;
  }

  return source as SessionRawLike;
}

function getSessionInfoPath(value: unknown): string | null {
  const source = asObject(value);
  const sessionInfo = asObject(source?.SessionInfo);
  return normalizeStaticPrefix(sessionInfo?.Path);
}

function getSessionRelativePath(value: unknown): string | null {
  const raw = getSessionRaw(value);
  if (!raw) {
    return null;
  }

  const download = asObject(raw.download);
  const downloadSession = asObject(download?.session);
  const downloadPath = asNonEmptyString(downloadSession?.path);
  if (downloadPath) {
    return downloadPath.replace(/^\/+/, '');
  }

  const subscribe = asObject(raw.subscribe);
  const subscribePath = asNonEmptyString(
    asObject(subscribe?.SessionInfo)?.Path,
  );
  if (subscribePath) {
    return subscribePath.replace(/^\/+/, '');
  }

  const keyframes = asObject(raw.keyframes);
  const keyframePath = asNonEmptyString(asObject(keyframes?.SessionInfo)?.Path);
  if (keyframePath) {
    return keyframePath.replace(/^\/+/, '');
  }

  const staticPrefix = getSessionStaticPrefix(raw);
  if (!staticPrefix) {
    return null;
  }

  try {
    const url = new URL(staticPrefix);
    const marker = '/static/';
    const index = url.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }
    return url.pathname.slice(index + marker.length).replace(/^\/+/, '');
  } catch {
    return null;
  }
}

function toSafePathSegments(relativePath: string | null): string[] {
  if (!relativePath) {
    return [];
  }

  return relativePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    );
}

function getCaptureFilename(capture: TeamRadioCaptureSummary): string {
  const basename = capture.path
    ? path.posix.basename(capture.path.replace(/\\/g, '/')).trim()
    : '';
  if (basename.length > 0 && basename !== '.' && basename !== '..') {
    return basename;
  }
  return `capture-${capture.captureId}.mp3`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function pickCapture(
  captures: TeamRadioCaptureSummary[],
  options: {
    captureId?: string | number;
    driverNumber?: string | number;
  } = {},
): TeamRadioCaptureSummary | null {
  if (options.captureId !== undefined) {
    const selected = captures.find(
      (capture) => capture.captureId === String(options.captureId),
    );
    return selected ?? null;
  }

  if (options.driverNumber !== undefined) {
    const selected = captures.find(
      (capture) => capture.driverNumber === String(options.driverNumber),
    );
    return selected ?? null;
  }

  return captures[0] ?? null;
}

function getCaptureRecord(
  state: unknown,
  captureId: string,
): TeamRadioCapture | null {
  const root = asObject(state);
  if (!root) {
    return null;
  }

  const capturesValue = root.Captures;
  if (Array.isArray(capturesValue)) {
    const index = Number(captureId);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= capturesValue.length
    ) {
      return null;
    }
    return asObject(capturesValue[index]) as TeamRadioCapture | null;
  }

  if (!isPlainObject(capturesValue)) {
    return null;
  }

  return asObject(capturesValue[captureId]) as TeamRadioCapture | null;
}

function updateCaptureRecord(
  state: unknown,
  captureId: string,
  patch: Partial<TeamRadioCapture>,
) {
  const record = getCaptureRecord(state, captureId);
  if (!record) {
    return;
  }
  Object.assign(record, patch);
}

export function getDefaultTeamRadioDownloadDir(
  source: unknown,
  options: { appName?: string } = {},
): string {
  const appName = options.appName ?? DEFAULT_APP_NAME;
  const base = path.join(getDataDir(appName), TEAM_RADIO_CACHE_DIR);
  const segments = toSafePathSegments(getSessionRelativePath(source));
  if (segments.length === 0) {
    return path.join(base, 'unknown-session');
  }
  return path.join(base, ...segments);
}

function parseCaptureTime(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function compareCaptureIds(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return right - left;
  }
  return b.localeCompare(a);
}

function truncateErrorText(value: string, max = 400): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

function guessAudioContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3':
    case '.mpeg':
    case '.mpga':
      return 'audio/mpeg';
    case '.m4a':
    case '.mp4':
      return 'audio/mp4';
    case '.wav':
      return 'audio/wav';
    case '.webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

function getTranscriptionCachePath(filePath: string): string {
  return `${filePath}${TEAM_RADIO_TRANSCRIPTION_CACHE_SUFFIX}`;
}

export function getTeamRadioPlaybackCommand(
  filePath: string,
  options: {
    player?: TeamRadioPlayer;
    platform?: NodeJS.Platform;
  } = {},
): TeamRadioPlaybackCommand {
  const player = options.player ?? 'system';
  const platform = options.platform ?? process.platform;

  switch (player) {
    case 'afplay':
      return {
        player,
        command: 'afplay',
        args: [filePath],
        detached: true,
        shell: false,
      };
    case 'ffplay':
      return {
        player,
        command: 'ffplay',
        args: ['-nodisp', '-autoexit', '-loglevel', 'error', filePath],
        detached: true,
        shell: false,
      };
    case 'mpv':
      return {
        player,
        command: 'mpv',
        args: ['--really-quiet', '--force-window=no', filePath],
        detached: true,
        shell: false,
      };
    case 'vlc':
      return {
        player,
        command: 'vlc',
        args: ['--intf', 'dummy', '--play-and-exit', filePath],
        detached: true,
        shell: false,
      };
    case 'system':
    default:
      if (platform === 'darwin') {
        return {
          player,
          command: 'open',
          args: [filePath],
          detached: true,
          shell: false,
        };
      }
      if (platform === 'win32') {
        return {
          player,
          command: 'cmd',
          args: ['/c', 'start', '', filePath],
          detached: true,
          shell: false,
        };
      }
      return {
        player,
        command: 'xdg-open',
        args: [filePath],
        detached: true,
        shell: false,
      };
  }
}

async function launchTeamRadioPlayback(
  playback: TeamRadioPlaybackCommand,
  spawnImpl: TeamRadioSpawnImpl,
): Promise<number | null> {
  const child = spawnImpl(playback.command, playback.args, {
    stdio: 'ignore',
    detached: playback.detached,
    shell: playback.shell,
  });

  const pid = typeof child.pid === 'number' ? child.pid : null;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      handler();
    };

    if (typeof child.once === 'function') {
      child.once('error', (error) => {
        finish(() => {
          reject(error instanceof Error ? error : new Error(String(error)));
        });
      });
    }

    setTimeout(() => {
      finish(() => {
        if (playback.detached) {
          child.unref?.();
        }
        resolve();
      });
    }, 0);
  });

  return pid;
}

async function readTranscriptionCache(
  filePath: string,
): Promise<TeamRadioTranscriptionCache | null> {
  try {
    const raw = await fs.readFile(getTranscriptionCachePath(filePath), 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const text = asNonEmptyString((parsed as any)?.text);
    const model = asNonEmptyString((parsed as any)?.model);
    const createdAt = asNonEmptyString((parsed as any)?.createdAt);
    const backend =
      normalizeTranscriptionBackend((parsed as any)?.backend) ?? 'openai';
    if (!text || !model || !createdAt) {
      return null;
    }
    return { text, model, createdAt, backend };
  } catch {
    return null;
  }
}

async function writeTranscriptionCache(
  filePath: string,
  cache: TeamRadioTranscriptionCache,
): Promise<string> {
  const transcriptionFilePath = getTranscriptionCachePath(filePath);
  await fs.writeFile(
    transcriptionFilePath,
    `${JSON.stringify(cache, null, 2)}\n`,
    'utf-8',
  );
  return transcriptionFilePath;
}

function extractTranscriptionText(bodyText: string): string | null {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const direct =
      asNonEmptyString((parsed as any)?.text) ??
      asNonEmptyString((parsed as any)?.output_text);
    if (direct) {
      return direct;
    }
    const segments = Array.isArray((parsed as any)?.segments)
      ? ((parsed as any).segments as unknown[])
          .map((segment) => asNonEmptyString((segment as any)?.text))
          .filter((segment): segment is string => Boolean(segment))
      : [];
    if (segments.length > 0) {
      return segments.join(' ').trim();
    }
  } catch {
    // Fall back to raw text when the response body is not JSON.
  }

  return trimmed;
}

function getLocalTranscriptionCommand(): string {
  return (
    asNonEmptyString(
      process.env.F1AIRE_TEAM_RADIO_LOCAL_TRANSCRIPTION_COMMAND,
    ) ?? DEFAULT_LOCAL_TEAM_RADIO_TRANSCRIPTION_COMMAND
  );
}

function getLocalTranscriptionOutputPath(
  filePath: string,
  outputDir: string,
): string {
  return path.join(outputDir, `${path.parse(filePath).name}.json`);
}

async function runExecFile(
  command: string,
  args: string[],
  options: TeamRadioExecFileOptions,
  execFileImpl: TeamRadioExecFileImpl,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stdout,
            stderr,
          }),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function transcribeAudioFileLocally(opts: {
  filePath: string;
  model: string;
  command?: string;
  execFileImpl?: TeamRadioExecFileImpl;
}): Promise<string> {
  const command =
    asNonEmptyString(opts.command) ?? getLocalTranscriptionCommand();
  const outputDir = await fs.mkdtemp(
    path.join(tmpdir(), 'f1aire-team-radio-transcription-'),
  );
  const outputPath = getLocalTranscriptionOutputPath(opts.filePath, outputDir);
  const execImpl: TeamRadioExecFileImpl =
    opts.execFileImpl ??
    ((file, args, options, callback) =>
      execFile(
        file,
        args,
        { ...options, encoding: 'utf8' },
        (error, stdout, stderr) =>
          callback(error, String(stdout), String(stderr)),
      ));

  try {
    const { stdout, stderr } = await runExecFile(
      command,
      [
        opts.filePath,
        '--model',
        opts.model,
        '--output_format',
        'json',
        '--output_dir',
        outputDir,
        '--verbose',
        'False',
      ],
      {
        timeout: TRANSCRIPTION_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      },
      execImpl,
    );

    try {
      const bodyText = await fs.readFile(outputPath, 'utf-8');
      const transcription = extractTranscriptionText(bodyText);
      if (transcription) {
        return transcription;
      }
    } catch {
      // Fall through to stdout/stderr parsing.
    }

    const fallback =
      extractTranscriptionText(stdout) ?? extractTranscriptionText(stderr);
    if (fallback) {
      return fallback;
    }

    throw new Error(
      `Local transcription command ${command} produced no readable transcript for ${path.basename(opts.filePath)}.`,
    );
  } catch (error) {
    const commandText = `${command}`;
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
      throw new Error(
        `Local transcription command ${commandText} was not found. Install whisper/ffmpeg or configure F1AIRE_TEAM_RADIO_LOCAL_TRANSCRIPTION_COMMAND.`,
      );
    }

    if ((error as { killed?: boolean } | null)?.killed || isAbortError(error)) {
      throw new Error(
        `Timed out transcribing ${path.basename(opts.filePath)} after ${TRANSCRIPTION_TIMEOUT_MS}ms`,
      );
    }

    const stderr = asNonEmptyString((error as { stderr?: unknown })?.stderr);
    if (error instanceof Error) {
      throw new Error(
        stderr
          ? `Local transcription failed for ${path.basename(opts.filePath)}: ${truncateErrorText(stderr)}`
          : error.message,
      );
    }

    throw error;
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

async function transcribeAudioFile(opts: {
  filePath: string;
  apiKey: string;
  model: string;
  apiBase?: string;
  chatGptAccountId?: string;
  chatGptTranscription?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const apiBase = (
    opts.apiBase ??
    process.env.OPENAI_API_BASE ??
    DEFAULT_OPENAI_API_BASE
  ).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TRANSCRIPTION_TIMEOUT_MS,
  );

  try {
    const buffer = await fs.readFile(opts.filePath);
    const form = new FormData();
    if (!opts.chatGptTranscription) {
      form.set('model', opts.model);
    }
    form.set(
      'file',
      new Blob([buffer], { type: guessAudioContentType(opts.filePath) }),
      path.basename(opts.filePath),
    );

    const response = await fetchImpl(
      opts.chatGptTranscription
        ? `${apiBase}/transcribe`
        : `${apiBase}/audio/transcriptions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.apiKey}`,
          originator: 'f1aire',
          'User-Agent': USER_AGENT,
          ...(opts.chatGptAccountId
            ? { 'ChatGPT-Account-Id': opts.chatGptAccountId }
            : {}),
        },
        body: form,
        signal: controller.signal,
      },
    );
    const bodyText = await response.text();
    if (!response.ok) {
      const detail = truncateErrorText(bodyText);
      throw new Error(
        detail.length > 0
          ? `Failed to transcribe ${path.basename(opts.filePath)}: HTTP ${response.status} ${detail}`
          : `Failed to transcribe ${path.basename(opts.filePath)}: HTTP ${response.status}`,
      );
    }

    const transcription = extractTranscriptionText(bodyText);
    if (!transcription) {
      throw new Error(
        `OpenAI returned an empty transcription for ${path.basename(opts.filePath)}.`,
      );
    }
    return transcription;
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Timed out transcribing ${path.basename(opts.filePath)} after ${TRANSCRIPTION_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getSessionStaticPrefix(source: unknown): string | null {
  const raw = getSessionRaw(source);
  if (!raw) {
    return null;
  }

  const manifestPrefix = normalizeStaticPrefix(asObject(raw.download)?.prefix);
  if (manifestPrefix) {
    return manifestPrefix;
  }

  const subscribePath = getSessionInfoPath(raw.subscribe);
  if (subscribePath) {
    return subscribePath;
  }

  return getSessionInfoPath(raw.keyframes);
}

export function resolveStaticAssetUrl(
  staticPrefix: string | null | undefined,
  assetPath: unknown,
): string | null {
  const path = asNonEmptyString(assetPath);
  if (!path) {
    return null;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const prefix = normalizeStaticPrefix(staticPrefix);
  if (!prefix) {
    return null;
  }

  return new URL(path.replace(/^\/+/, ''), prefix).toString();
}

export function getTeamRadioCaptures(
  state: unknown,
  options: { staticPrefix?: string | null } = {},
): TeamRadioCaptureSummary[] {
  const root = asObject(state);
  if (!root) {
    return [];
  }

  const capturesValue = root.Captures;
  const entries = Array.isArray(capturesValue)
    ? capturesValue.map((capture, index) => [String(index), capture] as const)
    : isPlainObject(capturesValue)
      ? Object.entries(capturesValue)
      : [];

  const captures = entries
    .map(([captureId, capture]) => {
      const record = asObject(capture);
      if (!record) {
        return null;
      }
      const utc = asNonEmptyString(record.Utc);
      return {
        captureId,
        utc,
        driverNumber: asNonEmptyString(record.RacingNumber),
        path: asNonEmptyString(record.Path),
        assetUrl: resolveStaticAssetUrl(
          options.staticPrefix ?? null,
          record.Path,
        ),
        downloadedFilePath: asNonEmptyString(record.DownloadedFilePath),
        hasTranscription: asNonEmptyString(record.Transcription) !== null,
        sortTime: parseCaptureTime(utc),
      };
    })
    .filter((capture) => capture !== null);

  captures.sort((left, right) => {
    if (left.sortTime !== null || right.sortTime !== null) {
      if (left.sortTime === null) {
        return 1;
      }
      if (right.sortTime === null) {
        return -1;
      }
      if (left.sortTime !== right.sortTime) {
        return right.sortTime - left.sortTime;
      }
    }
    return compareCaptureIds(left.captureId, right.captureId);
  });

  return captures.map((capture) => ({
    captureId: capture.captureId,
    utc: capture.utc,
    driverNumber: capture.driverNumber,
    path: capture.path,
    assetUrl: capture.assetUrl,
    downloadedFilePath: capture.downloadedFilePath,
    hasTranscription: capture.hasTranscription,
  }));
}

export async function downloadTeamRadioCapture(opts: {
  source: unknown;
  state: unknown;
  captureId?: string | number;
  driverNumber?: string | number;
  destinationDir?: string;
  appName?: string;
  overwrite?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<TeamRadioDownloadResult> {
  const sessionPrefix = getSessionStaticPrefix(opts.source);
  const captures = getTeamRadioCaptures(opts.state, {
    staticPrefix: sessionPrefix,
  });
  const capture = pickCapture(captures, {
    captureId: opts.captureId,
    driverNumber: opts.driverNumber,
  });

  if (!capture) {
    throw new Error('No matching team radio capture was found.');
  }
  if (!capture.assetUrl) {
    throw new Error(
      'Unable to resolve a static asset URL for the selected team radio capture.',
    );
  }

  const destinationDir =
    opts.destinationDir ??
    getDefaultTeamRadioDownloadDir(opts.source, { appName: opts.appName });
  await fs.mkdir(destinationDir, { recursive: true });

  const filePath = path.join(destinationDir, getCaptureFilename(capture));
  if (!opts.overwrite) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        updateCaptureRecord(opts.state, capture.captureId, {
          DownloadedFilePath: filePath,
        });
        return {
          ...capture,
          filePath,
          bytes: stats.size,
          reused: true,
          downloadedFilePath: filePath,
          sessionPrefix,
          destinationDir,
        };
      }
    } catch {
      // File missing or unreadable; continue to download.
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const fetchImpl = opts.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(capture.assetUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download ${capture.assetUrl}: HTTP ${response.status}`,
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    updateCaptureRecord(opts.state, capture.captureId, {
      DownloadedFilePath: filePath,
    });
    return {
      ...capture,
      filePath,
      bytes: buffer.byteLength,
      reused: false,
      downloadedFilePath: filePath,
      sessionPrefix,
      destinationDir,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(
        `Timed out downloading ${capture.assetUrl} after ${FETCH_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function transcribeTeamRadioCapture(opts: {
  source: unknown;
  state: unknown;
  captureId?: string | number;
  driverNumber?: string | number;
  destinationDir?: string;
  appName?: string;
  overwriteDownload?: boolean;
  forceTranscription?: boolean;
  backend?: TeamRadioTranscriptionBackend;
  apiKey?: string | null;
  chatGptAccountId?: string;
  chatGptTranscription?: boolean;
  model?: string;
  apiBase?: string;
  localCommand?: string;
  downloadFetchImpl?: typeof fetch;
  transcriptionFetchImpl?: typeof fetch;
  execFileImpl?: TeamRadioExecFileImpl;
}): Promise<TeamRadioTranscriptionResult> {
  const backend = resolveTranscriptionBackend({
    backend: opts.backend,
  });
  const requestedModel =
    asNonEmptyString(opts.model) ?? getDefaultTranscriptionModel(backend);
  const download = await downloadTeamRadioCapture({
    source: opts.source,
    state: opts.state,
    captureId: opts.captureId,
    driverNumber: opts.driverNumber,
    destinationDir: opts.destinationDir,
    appName: opts.appName,
    overwrite: opts.overwriteDownload,
    fetchImpl: opts.downloadFetchImpl,
  });

  const cached = opts.forceTranscription
    ? null
    : await readTranscriptionCache(download.filePath);
  if (
    cached &&
    cached.backend === backend &&
    (opts.model === undefined || cached.model === requestedModel)
  ) {
    updateCaptureRecord(opts.state, download.captureId, {
      DownloadedFilePath: download.filePath,
      Transcription: cached.text,
    });
    return {
      ...download,
      hasTranscription: true,
      downloadedFilePath: download.filePath,
      backend: cached.backend,
      transcription: cached.text,
      transcriptionFilePath: getTranscriptionCachePath(download.filePath),
      transcriptionReused: true,
      model: cached.model,
    };
  }

  let transcription: string;
  if (backend === 'local') {
    transcription = await transcribeAudioFileLocally({
      filePath: download.filePath,
      model: requestedModel,
      command: opts.localCommand,
      execFileImpl: opts.execFileImpl,
    });
  } else {
    const apiKey =
      asNonEmptyString(opts.apiKey) ??
      asNonEmptyString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required to transcribe team radio clips. Set OPENAI_API_KEY or save a key in f1aire settings.',
      );
    }

    transcription = await transcribeAudioFile({
      filePath: download.filePath,
      apiKey,
      model: requestedModel,
      apiBase: opts.apiBase,
      chatGptAccountId: opts.chatGptAccountId,
      chatGptTranscription: opts.chatGptTranscription,
      fetchImpl: opts.transcriptionFetchImpl,
    });
  }
  const transcriptionFilePath = await writeTranscriptionCache(
    download.filePath,
    {
      text: transcription,
      model: requestedModel,
      createdAt: new Date().toISOString(),
      backend,
    },
  );
  updateCaptureRecord(opts.state, download.captureId, {
    DownloadedFilePath: download.filePath,
    Transcription: transcription,
  });

  return {
    ...download,
    hasTranscription: true,
    downloadedFilePath: download.filePath,
    backend,
    transcription,
    transcriptionFilePath,
    transcriptionReused: false,
    model: requestedModel,
  };
}

export async function playTeamRadioCapture(opts: {
  source: unknown;
  state: unknown;
  captureId?: string | number;
  driverNumber?: string | number;
  destinationDir?: string;
  appName?: string;
  overwriteDownload?: boolean;
  fetchImpl?: typeof fetch;
  player?: TeamRadioPlayer;
  platform?: NodeJS.Platform;
  spawnImpl?: TeamRadioSpawnImpl;
}): Promise<TeamRadioPlaybackResult> {
  const download = await downloadTeamRadioCapture({
    source: opts.source,
    state: opts.state,
    captureId: opts.captureId,
    driverNumber: opts.driverNumber,
    destinationDir: opts.destinationDir,
    appName: opts.appName,
    overwrite: opts.overwriteDownload,
    fetchImpl: opts.fetchImpl,
  });

  const playback = getTeamRadioPlaybackCommand(download.filePath, {
    player: opts.player,
    platform: opts.platform,
  });
  const pid = await launchTeamRadioPlayback(
    playback,
    opts.spawnImpl ??
      ((command, args, options) => spawn(command, args, options)),
  );

  updateCaptureRecord(opts.state, download.captureId, {
    DownloadedFilePath: download.filePath,
  });

  return {
    ...download,
    player: playback.player,
    command: playback.command,
    args: [...playback.args],
    pid,
  };
}
