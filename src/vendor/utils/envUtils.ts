import { homedir } from 'node:os';
import { join } from 'node:path';

export function getClaudeConfigHomeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
}

export function isEnvTruthy(envVar: string | boolean | undefined): boolean {
  if (!envVar) {
    return false;
  }

  if (typeof envVar === 'boolean') {
    return envVar;
  }

  return ['1', 'true', 'yes', 'on'].includes(envVar.toLowerCase().trim());
}

export function isEnvDefinedFalsy(
  envVar: string | boolean | undefined,
): boolean {
  if (envVar === undefined) {
    return false;
  }

  if (typeof envVar === 'boolean') {
    return !envVar;
  }

  if (!envVar) {
    return false;
  }

  return ['0', 'false', 'no', 'off'].includes(envVar.toLowerCase().trim());
}
