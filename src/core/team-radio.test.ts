import path from 'node:path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import {
  downloadTeamRadioCapture,
  getDefaultTeamRadioDownloadDir,
  getSessionStaticPrefix,
  getTeamRadioCaptures,
  getTeamRadioPlaybackCommand,
  playTeamRadioCapture,
  resolveStaticAssetUrl,
  transcribeTeamRadioCapture,
} from './team-radio.js';

describe('team radio helpers', () => {
  it('prefers the download manifest prefix when resolving clip URLs', () => {
    const staticPrefix = getSessionStaticPrefix({
      raw: {
        download: {
          prefix:
            'https://livetiming.formula1.com/static/2024/Test_Weekend/Race/',
        },
        subscribe: {},
        keyframes: null,
      },
    });

    expect(staticPrefix).toBe(
      'https://livetiming.formula1.com/static/2024/Test_Weekend/Race/',
    );

    const captures = getTeamRadioCaptures(
      {
        Captures: {
          '0': {
            Utc: '2024-05-26T12:15:25.710Z',
            RacingNumber: '81',
            Path: 'TeamRadio/OSCPIA01_81_20240526_121525.mp3',
          },
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      },
      { staticPrefix },
    );

    expect(captures).toMatchObject([
      {
        captureId: '1',
        driverNumber: '4',
        assetUrl:
          'https://livetiming.formula1.com/static/2024/Test_Weekend/Race/TeamRadio/LANNOR01_4_20240526_121625.mp3',
      },
      {
        captureId: '0',
        driverNumber: '81',
        assetUrl:
          'https://livetiming.formula1.com/static/2024/Test_Weekend/Race/TeamRadio/OSCPIA01_81_20240526_121525.mp3',
      },
    ]);
  });

  it('falls back to SessionInfo.Path when the manifest is unavailable', () => {
    const staticPrefix = getSessionStaticPrefix({
      raw: {
        download: null,
        subscribe: {
          SessionInfo: {
            Path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
          },
        },
        keyframes: null,
      },
    });

    expect(staticPrefix).toBe(
      'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
    );
    expect(
      resolveStaticAssetUrl(
        staticPrefix,
        'TeamRadio/LANNOR01_4_20240526_121625.mp3',
      ),
    ).toBe(
      'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/TeamRadio/LANNOR01_4_20240526_121625.mp3',
    );
  });

  it('derives a stable local cache directory from the session path', () => {
    const previousXdgDataHome = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = '/tmp/f1aire-team-radio-cache';

    try {
      expect(
        getDefaultTeamRadioDownloadDir(
          {
            raw: {
              download: {
                session: {
                  path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
                },
              },
              subscribe: {},
              keyframes: null,
            },
          },
          { appName: 'f1aire' },
        ),
      ).toBe(
        path.join(
          '/tmp/f1aire-team-radio-cache',
          'f1aire',
          'data',
          'team-radio',
          '2024',
          '2024-05-26_Test_Weekend',
          '2024-05-26_Race',
        ),
      );
    } finally {
      if (previousXdgDataHome === undefined) {
        delete process.env.XDG_DATA_HOME;
      } else {
        process.env.XDG_DATA_HOME = previousXdgDataHome;
      }
    }
  });

  it('downloads a radio clip and reuses the local file on subsequent calls', async () => {
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-team-radio-'),
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('radio-bytes', { status: 200 }));

    try {
      const source = {
        raw: {
          download: {
            prefix:
              'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            session: {
              path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          subscribe: {},
          keyframes: null,
        },
      };
      const state = {
        Captures: {
          '0': {
            Utc: '2024-05-26T12:15:25.710Z',
            RacingNumber: '81',
            Path: 'TeamRadio/OSCPIA01_81_20240526_121525.mp3',
          },
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };

      const first = await downloadTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        fetchImpl,
      });

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        bytes: 11,
        filePath: path.join(destinationDir, 'LANNOR01_4_20240526_121625.mp3'),
      });
      expect(readFileSync(first.filePath, 'utf-8')).toBe('radio-bytes');
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      const second = await downloadTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        fetchImpl,
      });

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        filePath: first.filePath,
        bytes: 11,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it('transcribes a radio clip and reuses the cached transcript on subsequent calls', async () => {
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-team-radio-transcribe-'),
    );
    const downloadFetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('radio-bytes', { status: 200 }));
    const transcriptionFetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: 'Box now, box now.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      const source = {
        raw: {
          download: {
            prefix:
              'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            session: {
              path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          subscribe: {},
          keyframes: null,
        },
      };
      const state = {
        Captures: {
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };

      const first = await transcribeTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        apiKey: 'sk-test',
        downloadFetchImpl,
        transcriptionFetchImpl,
      });

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        backend: 'openai',
        transcriptionReused: false,
        model: 'gpt-4o-transcribe',
        transcription: 'Box now, box now.',
        filePath: path.join(destinationDir, 'LANNOR01_4_20240526_121625.mp3'),
        transcriptionFilePath: `${path.join(destinationDir, 'LANNOR01_4_20240526_121625.mp3')}.transcription.json`,
      });
      expect(readFileSync(first.filePath, 'utf-8')).toBe('radio-bytes');
      expect(readFileSync(first.transcriptionFilePath, 'utf-8')).toContain(
        'Box now, box now.',
      );
      expect((state as any).Captures['1']).toMatchObject({
        DownloadedFilePath: first.filePath,
        Transcription: 'Box now, box now.',
      });
      expect(downloadFetchImpl).toHaveBeenCalledTimes(1);
      expect(transcriptionFetchImpl).toHaveBeenCalledTimes(1);

      const second = await transcribeTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        apiKey: 'sk-test',
        downloadFetchImpl,
        transcriptionFetchImpl,
      });

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        backend: 'openai',
        transcriptionReused: true,
        transcription: 'Box now, box now.',
        filePath: first.filePath,
        transcriptionFilePath: first.transcriptionFilePath,
      });
      expect(downloadFetchImpl).toHaveBeenCalledTimes(1);
      expect(transcriptionFetchImpl).toHaveBeenCalledTimes(1);

      const captures = getTeamRadioCaptures(state, {
        staticPrefix:
          'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
      });
      expect(captures).toMatchObject([
        {
          captureId: '1',
          downloadedFilePath: first.filePath,
          hasTranscription: true,
        },
      ]);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it('transcribes through the ChatGPT backend when OAuth auth is selected', async () => {
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-team-radio-chatgpt-transcribe-'),
    );
    const downloadFetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('radio-bytes', { status: 200 }));
    const transcriptionFetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ text: 'Stay out this lap.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      const source = {
        raw: {
          download: {
            prefix:
              'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            session: {
              path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          subscribe: {},
          keyframes: null,
        },
      };
      const state = {
        Captures: {
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };

      const result = await transcribeTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        apiKey: 'chatgpt-access-token',
        apiBase: 'https://chatgpt.com/backend-api',
        chatGptAccountId: 'acct-chatgpt',
        chatGptTranscription: true,
        downloadFetchImpl,
        transcriptionFetchImpl,
      } as any);

      expect(result.transcription).toBe('Stay out this lap.');
      expect(transcriptionFetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = transcriptionFetchImpl.mock.calls[0];
      expect(url).toBe('https://chatgpt.com/backend-api/transcribe');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer chatgpt-access-token',
      );
      expect(
        (init?.headers as Record<string, string>)['ChatGPT-Account-Id'],
      ).toBe('acct-chatgpt');
      expect((init?.headers as Record<string, string>).originator).toBe(
        'f1aire',
      );
      expect((init?.headers as Record<string, string>)['User-Agent']).toBe(
        'f1aire/0.1.0',
      );
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it('transcribes a radio clip locally when the local backend is selected', async () => {
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-team-radio-local-transcribe-'),
    );
    const downloadFetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('radio-bytes', { status: 200 }));
    const execFileImpl = vi.fn((file, args, _options, callback) => {
      expect(file).toBe('whisper');
      const inputPath = String(args[0]);
      const outputDir = String(args[args.indexOf('--output_dir') + 1]);
      writeFileSync(
        path.join(outputDir, `${path.parse(inputPath).name}.json`),
        JSON.stringify({ text: 'Local copy, box now.' }),
      );
      callback(null, '', '');
    });

    try {
      const source = {
        raw: {
          download: {
            prefix:
              'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            session: {
              path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          subscribe: {},
          keyframes: null,
        },
      };
      const state = {
        Captures: {
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };

      const first = await transcribeTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        backend: 'local',
        downloadFetchImpl,
        execFileImpl,
      });

      expect(first).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        reused: false,
        backend: 'local',
        transcriptionReused: false,
        model: 'base',
        transcription: 'Local copy, box now.',
      });
      expect(downloadFetchImpl).toHaveBeenCalledTimes(1);
      expect(execFileImpl).toHaveBeenCalledTimes(1);

      const second = await transcribeTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        backend: 'local',
        downloadFetchImpl,
        execFileImpl,
      });

      expect(second).toMatchObject({
        captureId: '1',
        reused: true,
        backend: 'local',
        transcriptionReused: true,
        transcription: 'Local copy, box now.',
      });
      expect(downloadFetchImpl).toHaveBeenCalledTimes(1);
      expect(execFileImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });
  it('builds playback commands for system and explicit players', () => {
    expect(
      getTeamRadioPlaybackCommand('/tmp/radio.mp3', { platform: 'darwin' }),
    ).toEqual({
      player: 'system',
      command: 'open',
      args: ['/tmp/radio.mp3'],
      detached: true,
      shell: false,
    });

    expect(
      getTeamRadioPlaybackCommand('/tmp/radio.mp3', { player: 'ffplay' }),
    ).toEqual({
      player: 'ffplay',
      command: 'ffplay',
      args: ['-nodisp', '-autoexit', '-loglevel', 'error', '/tmp/radio.mp3'],
      detached: true,
      shell: false,
    });
  });

  it('plays a radio clip via the selected player after downloading it', async () => {
    const destinationDir = mkdtempSync(
      path.join(tmpdir(), 'f1aire-team-radio-play-'),
    );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('radio-bytes', { status: 200 }));
    const once = vi.fn();
    const unref = vi.fn();
    const spawnImpl = vi.fn().mockReturnValue({
      pid: 4321,
      once,
      unref,
    });

    try {
      const source = {
        raw: {
          download: {
            prefix:
              'https://livetiming.formula1.com/static/2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            session: {
              path: '2024/2024-05-26_Test_Weekend/2024-05-26_Race/',
            },
          },
          subscribe: {},
          keyframes: null,
        },
      };
      const state = {
        Captures: {
          '1': {
            Utc: '2024-05-26T12:16:25.710Z',
            RacingNumber: '4',
            Path: 'TeamRadio/LANNOR01_4_20240526_121625.mp3',
          },
        },
      };
      const filePath = path.join(
        destinationDir,
        'LANNOR01_4_20240526_121625.mp3',
      );

      const result = await playTeamRadioCapture({
        source,
        state,
        captureId: '1',
        destinationDir,
        fetchImpl,
        player: 'ffplay',
        spawnImpl,
      });

      expect(result).toMatchObject({
        captureId: '1',
        driverNumber: '4',
        filePath,
        player: 'ffplay',
        command: 'ffplay',
        args: ['-nodisp', '-autoexit', '-loglevel', 'error', filePath],
        pid: 4321,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(spawnImpl).toHaveBeenCalledWith(
        'ffplay',
        ['-nodisp', '-autoexit', '-loglevel', 'error', filePath],
        {
          stdio: 'ignore',
          detached: true,
          shell: false,
        },
      );
      expect(once).toHaveBeenCalledWith('error', expect.any(Function));
      expect(unref).toHaveBeenCalledTimes(1);
      expect((state as any).Captures['1']).toMatchObject({
        DownloadedFilePath: filePath,
      });
    } finally {
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });
});
