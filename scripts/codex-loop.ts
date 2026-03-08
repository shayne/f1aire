import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

export type CliArgs = {
  dryRun: boolean;
  maxIterations: number | null;
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

export function getDefaultSchemaPath(repoRoot: string) {
  return path.join(repoRoot, 'scripts', 'codex-loop-output.schema.json');
}

export function renderLoopPrompt(options: {
  cwd: string;
  referenceRepo: string;
  iteration: number;
}) {
  return [
    `You are working in ${options.cwd}.`,
    `Reference repository: ${options.referenceRepo}.`,
    `This is iteration ${options.iteration}.`,
    'Audit f1aire against the reference repo for F1 data usage and understanding gaps.',
    'Focus on feed definitions, parsing, normalization, processors, typed models, APIs, replay/control primitives, analysis tooling, and team radio workflows.',
    'Rank remaining work as P0, P1, P2, or P3.',
    'Implement exactly one highest-priority P0, P1, or P2 item.',
    'Run targeted verification before you claim success.',
    'Commit on main using the global git user after verification passes.',
    'If no P0, P1, or P2 items remain, do not make changes and report no_work_left.',
    'Use the checked-in output schema exactly.',
    'Return only the final JSON object required by the output schema.',
  ].join('\n');
}

export function requireMainBranchAndCleanTree(options: {
  branch: string;
  isDirty: boolean;
}) {
  if (options.branch !== 'main') {
    throw new Error(`This loop only runs on main. Current branch: ${options.branch}`);
  }
  if (options.isDirty) {
    throw new Error('This loop requires a clean working tree before it starts.');
  }
}

export function buildIterationPaths(repoRoot: string, iteration: number) {
  const label = String(iteration).padStart(3, '0');
  const iterationDir = path.join(repoRoot, '.codex-loop', `iteration-${label}`);
  return {
    iterationDir,
    promptPath: path.join(iterationDir, 'prompt.txt'),
    eventsPath: path.join(iterationDir, 'events.jsonl'),
    stderrPath: path.join(iterationDir, 'stderr.txt'),
    finalOutputPath: path.join(iterationDir, 'final.json'),
  };
}

export function shouldStopForMaxIterations(options: {
  iteration: number;
  maxIterations: number | null;
}) {
  if (options.maxIterations === null) {
    return false;
  }
  return options.iteration >= options.maxIterations;
}

export function parseCliArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let maxIterations: number | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--max-iterations') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--max-iterations requires a numeric value.');
      }
      const parsed = Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error('--max-iterations must be a positive integer.');
      }
      maxIterations = parsed;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, maxIterations };
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
    if (!result.tests_passed) {
      throw new Error('Implemented results must report tests_passed=true.');
    }
  }

  if (result.status === 'no_work_left') {
    if (counts.P0 > 0 || counts.P1 > 0 || counts.P2 > 0) {
      throw new Error(
        `no_work_left is invalid while P0/P1/P2 remain (${counts.P0}/${counts.P1}/${counts.P2}).`,
      );
    }
  }

  if (result.status === 'blocked') {
    if (
      typeof result.blocking_reason !== 'string'
      || result.blocking_reason.trim().length === 0
    ) {
      throw new Error('Blocked results must include a blocking_reason.');
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

function runCommand(repoRoot: string, args: string[]) {
  return execFileSync(args[0]!, args.slice(1), {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
}

function getCurrentBranch(repoRoot: string) {
  return runCommand(repoRoot, ['git', 'branch', '--show-current']);
}

function workingTreeIsDirty(repoRoot: string) {
  return runCommand(repoRoot, ['git', 'status', '--porcelain']).length > 0;
}

function requireGlobalGitIdentity(repoRoot: string) {
  const userName = runCommand(repoRoot, ['git', 'config', '--global', 'user.name']);
  const userEmail = runCommand(repoRoot, ['git', 'config', '--global', 'user.email']);
  if (!userName || !userEmail) {
    throw new Error('Global git user.name and user.email must be configured.');
  }
  return { userName, userEmail };
}

function verifyCommitExists(repoRoot: string, commit: string | null) {
  if (!commit) {
    return;
  }
  runCommand(repoRoot, ['git', 'rev-parse', '--verify', `${commit}^{commit}`]);
}

async function runCodexIteration(options: {
  repoRoot: string;
  prompt: string;
  iteration: number;
}) {
  const paths = buildIterationPaths(options.repoRoot, options.iteration);
  mkdirSync(paths.iterationDir, { recursive: true });
  writeFileSync(paths.promptPath, options.prompt, 'utf8');

  const command = buildCodexExecCommand({
    cwd: options.repoRoot,
    schemaPath: getDefaultSchemaPath(options.repoRoot),
    outputPath: paths.finalOutputPath,
    search: true,
  });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      cwd: options.repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.on('error', reject);
    child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    child.stdin.end(options.prompt);
    child.on('close', (code) => resolve(code ?? 1));
  });

  writeFileSync(paths.eventsPath, Buffer.concat(stdoutChunks));
  writeFileSync(paths.stderrPath, Buffer.concat(stderrChunks));

  if (exitCode !== 0) {
    throw new Error(
      `Codex iteration ${options.iteration} failed with exit code ${exitCode}. See ${paths.stderrPath}.`,
    );
  }

  const raw = readFileSync(paths.finalOutputPath, 'utf8');
  const parsed = validateLoopResult(JSON.parse(raw));
  verifyCommitExists(options.repoRoot, parsed.commit);
  return { command, paths, result: parsed };
}

export async function runLoop(options: {
  repoRoot: string;
  referenceRepo: string;
  args: CliArgs;
}) {
  requireMainBranchAndCleanTree({
    branch: getCurrentBranch(options.repoRoot),
    isDirty: workingTreeIsDirty(options.repoRoot),
  });
  requireGlobalGitIdentity(options.repoRoot);

  const schemaPath = getDefaultSchemaPath(options.repoRoot);
  let lastResult: LoopResult | null = null;

  for (let iteration = 1; ; iteration += 1) {
    const prompt = renderLoopPrompt({
      cwd: options.repoRoot,
      referenceRepo: options.referenceRepo,
      iteration,
    });
    const command = buildCodexExecCommand({
      cwd: options.repoRoot,
      schemaPath,
      outputPath: buildIterationPaths(options.repoRoot, iteration).finalOutputPath,
      search: true,
    });

    if (options.args.dryRun) {
      process.stdout.write(`${command.command} ${command.args.join(' ')}\n\n`);
      process.stdout.write(`${prompt}\n`);
      return null;
    }

    const completed = await runCodexIteration({
      repoRoot: options.repoRoot,
      prompt,
      iteration,
    });
    lastResult = completed.result;

    const nextAction = determineNextAction(completed.result);
    process.stdout.write(
      JSON.stringify(
        {
          iteration,
          status: completed.result.status,
          priority: completed.result.priority,
          selected_gap: completed.result.selected_gap,
          commit: completed.result.commit,
          remaining_counts: completed.result.remaining_counts,
        },
        null,
        2,
      ) + '\n',
    );

    if (nextAction === 'stop') {
      return lastResult;
    }

    if (nextAction === 'error') {
      throw new Error(
        `Codex reported a blocked iteration: ${completed.result.blocking_reason ?? 'unknown reason'}`,
      );
    }

    if (
      shouldStopForMaxIterations({
        iteration,
        maxIterations: options.args.maxIterations,
      })
    ) {
      throw new Error(
        `Reached max iterations (${options.args.maxIterations}) before all P0/P1/P2 work was closed.`,
      );
    }
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  await runLoop({
    repoRoot,
    referenceRepo: '/Users/shayne/code/undercut-f1',
    args,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
