import { spawnSync } from 'node:child_process';
import { getIsInteractive } from '../bootstrap/state.js';
import { logForDebugging } from './debug.js';
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js';
import { execFileNoThrow } from './execFileNoThrow.js';

let loggedTmuxCcDisable = false;
let checkedTmuxMouseHint = false;
let tmuxControlModeProbed: boolean | undefined;

function isTmuxControlModeEnvHeuristic(): boolean {
  if (!process.env.TMUX) {
    return false;
  }

  if (process.env.TERM_PROGRAM !== 'iTerm.app') {
    return false;
  }

  const term = process.env.TERM ?? '';
  return !term.startsWith('screen') && !term.startsWith('tmux');
}

function probeTmuxControlModeSync(): void {
  tmuxControlModeProbed = isTmuxControlModeEnvHeuristic();

  if (tmuxControlModeProbed || !process.env.TMUX || process.env.TERM_PROGRAM) {
    return;
  }

  try {
    const result = spawnSync(
      'tmux',
      ['display-message', '-p', '#{client_control_mode}'],
      { encoding: 'utf8', timeout: 2000 },
    );

    if (result.status === 0) {
      tmuxControlModeProbed = result.stdout.trim() === '1';
    }
  } catch {
    // Ignore probe failures and keep the heuristic answer.
  }
}

export function isTmuxControlMode(): boolean {
  if (tmuxControlModeProbed === undefined) {
    probeTmuxControlModeSync();
  }

  return tmuxControlModeProbed ?? false;
}

export function isFullscreenEnvEnabled(): boolean {
  if (isEnvDefinedFalsy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return false;
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_NO_FLICKER)) {
    return true;
  }

  if (isTmuxControlMode()) {
    if (!loggedTmuxCcDisable) {
      loggedTmuxCcDisable = true;
      logForDebugging(
        'fullscreen disabled: tmux -CC detected; set CLAUDE_CODE_NO_FLICKER=1 to override',
      );
    }

    return false;
  }

  return true;
}

export function isMouseTrackingEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE);
}

export function isMouseClicksDisabled(): boolean {
  return isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MOUSE_CLICKS);
}

export function isFullscreenActive(): boolean {
  return getIsInteractive() && isFullscreenEnvEnabled();
}

export async function maybeGetTmuxMouseHint(): Promise<string | null> {
  if (
    !process.env.TMUX ||
    !isFullscreenActive() ||
    isTmuxControlMode() ||
    checkedTmuxMouseHint
  ) {
    return null;
  }

  checkedTmuxMouseHint = true;

  const { stdout, code } = await execFileNoThrow(
    'tmux',
    ['show', '-Av', 'mouse'],
    { useCwd: false, timeout: 2000 },
  );

  if (code !== 0 || stdout.trim() === 'on') {
    return null;
  }

  return "tmux detected - scroll with PgUp/PgDn or add 'set -g mouse on' to ~/.tmux.conf";
}
