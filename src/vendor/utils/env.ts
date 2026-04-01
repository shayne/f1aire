type Platform = 'win32' | 'darwin' | 'linux';

function detectTerminal(): string | null {
  if (process.env.TERM_PROGRAM) {
    return process.env.TERM_PROGRAM;
  }

  if (process.env.TMUX) {
    return 'tmux';
  }

  if (process.env.TERM) {
    return process.env.TERM;
  }

  if (!process.stdout.isTTY) {
    return 'non-interactive';
  }

  return null;
}

export const env = {
  isCI: Boolean(process.env.CI),
  platform: (['win32', 'darwin'].includes(process.platform)
    ? process.platform
    : 'linux') as Platform,
  arch: process.arch,
  nodeVersion: process.version,
  terminal: detectTerminal(),
  isSSH: () =>
    Boolean(
      process.env.SSH_CONNECTION ||
        process.env.SSH_CLIENT ||
        process.env.SSH_TTY,
    ),
};
