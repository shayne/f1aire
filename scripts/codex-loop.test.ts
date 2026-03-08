import { describe, expect, test } from 'vitest';

import {
  buildCodexExecCommand,
  determineNextAction,
  validateLoopResult,
} from './codex-loop.ts';

describe('buildCodexExecCommand', () => {
  test('includes explicit YOLO mode', () => {
    const command = buildCodexExecCommand({
      cwd: '/Users/shayne/code/f1aire',
      schemaPath: '/Users/shayne/code/f1aire/scripts/codex-loop-output.schema.json',
      outputPath: '/tmp/final.json',
      search: true,
    });

    expect(command.command).toBe('codex');
    expect(command.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(command.args).toContain('--json');
  });
});

describe('validateLoopResult', () => {
  test('accepts an implemented result with a commit hash', () => {
    const result = validateLoopResult({
      status: 'implemented',
      selected_gap: 'Add missing topic processor',
      priority: 'P1',
      summary: 'Implemented one gap.',
      tests_run: ['npm test -- scripts/codex-loop.test.ts'],
      tests_passed: true,
      commit: 'abc1234',
      remaining_counts: { P0: 0, P1: 1, P2: 0, P3: 2 },
      blocking_reason: null,
    });

    expect(result.status).toBe('implemented');
  });

  test('rejects an implemented result without a commit hash', () => {
    expect(() =>
      validateLoopResult({
        status: 'implemented',
        selected_gap: 'Add missing topic processor',
        priority: 'P1',
        summary: 'Implemented one gap.',
        tests_run: ['npm test -- scripts/codex-loop.test.ts'],
        tests_passed: true,
        commit: '',
        remaining_counts: { P0: 0, P1: 1, P2: 0, P3: 2 },
        blocking_reason: null,
      }),
    ).toThrow(/commit/i);
  });

  test('rejects a no_work_left result if higher priority gaps remain', () => {
    expect(() =>
      validateLoopResult({
        status: 'no_work_left',
        selected_gap: null,
        priority: null,
        summary: 'Nothing left.',
        tests_run: [],
        tests_passed: true,
        commit: null,
        remaining_counts: { P0: 0, P1: 0, P2: 1, P3: 3 },
        blocking_reason: null,
      }),
    ).toThrow(/P2/i);
  });
});

describe('determineNextAction', () => {
  test('continues after an implemented iteration', () => {
    const action = determineNextAction(
      validateLoopResult({
        status: 'implemented',
        selected_gap: 'Add missing topic processor',
        priority: 'P1',
        summary: 'Implemented one gap.',
        tests_run: ['npm test -- scripts/codex-loop.test.ts'],
        tests_passed: true,
        commit: 'abc1234',
        remaining_counts: { P0: 0, P1: 1, P2: 0, P3: 2 },
        blocking_reason: null,
      }),
    );

    expect(action).toBe('continue');
  });

  test('stops when no P0 P1 or P2 work remains', () => {
    const action = determineNextAction(
      validateLoopResult({
        status: 'no_work_left',
        selected_gap: null,
        priority: null,
        summary: 'Nothing left.',
        tests_run: [],
        tests_passed: true,
        commit: null,
        remaining_counts: { P0: 0, P1: 0, P2: 0, P3: 4 },
        blocking_reason: null,
      }),
    );

    expect(action).toBe('stop');
  });
});
