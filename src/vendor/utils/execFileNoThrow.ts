import { spawn } from 'node:child_process';

type ExecFileOptions = {
  abortSignal?: AbortSignal;
  timeout?: number;
  preserveOutputOnError?: boolean;
  useCwd?: boolean;
  env?: NodeJS.ProcessEnv;
  stdin?: 'ignore' | 'inherit' | 'pipe';
  input?: string;
};

export function execFileNoThrow(
  file: string,
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string; code: number; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, {
      cwd: options.useCwd === false ? undefined : process.cwd(),
      env: options.env,
      signal: options.abortSignal,
      stdio: [
        options.stdin === 'inherit'
          ? 'inherit'
          : options.stdin === 'ignore'
            ? 'ignore'
            : 'pipe',
        'pipe',
        'pipe',
      ],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const finish = (
      code: number,
      error?: string,
      preserveOutput = true,
    ): void => {
      if (settled) {
        return;
      }

      settled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout: preserveOutput ? stdout : '',
        stderr: preserveOutput ? stderr : '',
        code,
        error,
      });
    };

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      finish(1, error.message, false);
    });

    child.on('close', (code, signal) => {
      const exitCode = code ?? 1;
      const error = signal ?? (exitCode === 0 ? undefined : String(exitCode));
      finish(
        exitCode,
        error,
        options.preserveOutputOnError ?? true,
      );
    });

    if (options.input && child.stdin) {
      child.stdin.end(options.input);
    }

    if (options.timeout) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
      }, options.timeout);
    }
  });
}
