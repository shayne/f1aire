import { describe, expect, test } from 'vitest';

import {
  buildCodexExecCommand,
  buildIterationPaths,
  determineNextAction,
  getDefaultSchemaPath,
  parseCliArgs,
  requireMainBranchAndCleanTree,
  renderLoopPrompt,
  shouldStopForMaxIterations,
  validateLoopResult,
} from './codex-loop.ts';

describe('buildCodexExecCommand', () => {
  test('includes explicit YOLO mode', () => {
    const command = buildCodexExecCommand({
      cwd: '/Users/shayne/code/f1aire',
      schemaPath: getDefaultSchemaPath('/Users/shayne/code/f1aire'),
      outputPath: '/tmp/final.json',
      search: true,
    });

    expect(command.command).toBe('codex');
    expect(command.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(command.args).toContain('--json');
    expect(command.args).toContain(
      '/Users/shayne/code/f1aire/scripts/codex-loop-output.schema.json',
    );
  });
});

describe('renderLoopPrompt', () => {
  test('targets the undercut reference repo and one priority item at a time', () => {
    const prompt = renderLoopPrompt({
      cwd: '/Users/shayne/code/f1aire',
      referenceRepo: '/Users/shayne/code/undercut-f1',
      iteration: 3,
    });

    expect(prompt).toContain('/Users/shayne/code/undercut-f1');
    expect(prompt).toContain('Implement exactly one highest-priority P0, P1, or P2 item');
    expect(prompt).toContain('Commit on main');
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

describe('requireMainBranchAndCleanTree', () => {
  test('rejects work outside main', () => {
    expect(() =>
      requireMainBranchAndCleanTree({
        branch: 'feature/codex-loop',
        isDirty: false,
      }),
    ).toThrow(/main/i);
  });

  test('rejects a dirty tree', () => {
    expect(() =>
      requireMainBranchAndCleanTree({
        branch: 'main',
        isDirty: true,
      }),
    ).toThrow(/clean/i);
  });
});

describe('buildIterationPaths', () => {
  test('builds per-iteration artifact paths under .codex-loop', () => {
    const paths = buildIterationPaths('/Users/shayne/code/f1aire', 4);

    expect(paths.iterationDir).toBe(
      '/Users/shayne/code/f1aire/.codex-loop/iteration-004',
    );
    expect(paths.finalOutputPath).toBe(
      '/Users/shayne/code/f1aire/.codex-loop/iteration-004/final.json',
    );
    expect(paths.eventsPath).toBe(
      '/Users/shayne/code/f1aire/.codex-loop/iteration-004/events.jsonl',
    );
  });
});

describe('shouldStopForMaxIterations', () => {
  test('stops when the max iteration cap is reached', () => {
    expect(shouldStopForMaxIterations({ iteration: 3, maxIterations: 3 })).toBe(
      true,
    );
  });

  test('continues when below the iteration cap', () => {
    expect(shouldStopForMaxIterations({ iteration: 2, maxIterations: 3 })).toBe(
      false,
    );
  });
});

describe('parseCliArgs', () => {
  test('parses dry-run and max-iterations flags', () => {
    expect(parseCliArgs(['--dry-run', '--max-iterations', '5'])).toEqual({
      dryRun: true,
      maxIterations: 5,
    });
  });

  test('defaults to no dry-run and no max iteration limit', () => {
    expect(parseCliArgs([])).toEqual({
      dryRun: false,
      maxIterations: null,
    });
  });
});
