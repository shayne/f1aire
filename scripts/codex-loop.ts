type LoopStatus = 'implemented' | 'no_work_left' | 'blocked';
type LoopPriority = 'P0' | 'P1' | 'P2' | 'P3' | null;

export type LoopResult = {
  status: LoopStatus;
  selected_gap: string | null;
  priority: LoopPriority;
  summary: string;
  tests_run: string[];
  tests_passed: boolean;
  commit: string | null;
  remaining_counts: {
    P0: number;
    P1: number;
    P2: number;
    P3: number;
  };
  blocking_reason: string | null;
};

export function buildCodexExecCommand(options: {
  cwd: string;
  schemaPath: string;
  outputPath: string;
  search: boolean;
}) {
  const args = [
    'exec',
    '--dangerously-bypass-approvals-and-sandbox',
    '--json',
    '--output-schema',
    options.schemaPath,
    '--output-last-message',
    options.outputPath,
    '--cd',
    options.cwd,
  ];

  if (options.search) {
    args.push('--search');
  }

  args.push('-');

  return { command: 'codex', args };
}

export function validateLoopResult(value: unknown): LoopResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Loop result must be an object.');
  }

  const result = value as Partial<LoopResult>;

  if (
    result.status !== 'implemented'
    && result.status !== 'no_work_left'
    && result.status !== 'blocked'
  ) {
    throw new Error('Loop result has an invalid status.');
  }

  if (typeof result.summary !== 'string' || result.summary.trim().length === 0) {
    throw new Error('Loop result must include a summary.');
  }

  if (!Array.isArray(result.tests_run)) {
    throw new Error('Loop result must include tests_run.');
  }

  if (typeof result.tests_passed !== 'boolean') {
    throw new Error('Loop result must include tests_passed.');
  }

  const counts = result.remaining_counts;
  if (
    !counts
    || typeof counts.P0 !== 'number'
    || typeof counts.P1 !== 'number'
    || typeof counts.P2 !== 'number'
    || typeof counts.P3 !== 'number'
  ) {
    throw new Error('Loop result must include remaining_counts.');
  }

  if (result.status === 'implemented') {
    if (typeof result.commit !== 'string' || result.commit.trim().length === 0) {
      throw new Error('Implemented results must include a commit hash.');
    }
  }

  if (result.status === 'no_work_left') {
    if (counts.P0 > 0 || counts.P1 > 0 || counts.P2 > 0) {
      throw new Error(
        `no_work_left is invalid while P0/P1/P2 remain (${counts.P0}/${counts.P1}/${counts.P2}).`,
      );
    }
  }

  return {
    status: result.status,
    selected_gap:
      typeof result.selected_gap === 'string' ? result.selected_gap : null,
    priority:
      result.priority === 'P0'
      || result.priority === 'P1'
      || result.priority === 'P2'
      || result.priority === 'P3'
        ? result.priority
        : null,
    summary: result.summary,
    tests_run: result.tests_run.map((entry) => String(entry)),
    tests_passed: result.tests_passed,
    commit: typeof result.commit === 'string' ? result.commit : null,
    remaining_counts: counts,
    blocking_reason:
      typeof result.blocking_reason === 'string' ? result.blocking_reason : null,
  };
}

export function determineNextAction(result: LoopResult): 'continue' | 'stop' | 'error' {
  if (result.status === 'implemented') {
    return 'continue';
  }
  if (result.status === 'no_work_left') {
    return 'stop';
  }
  return 'error';
}
