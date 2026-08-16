#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { execa } from 'execa';
import pc from 'picocolors';
import {
  DEFAULT_BASELINE_DIR,
  DEFAULT_RUN_DIR,
  baselinePath,
  latestTracePath,
  listBaselineNames,
  listTraces,
  readTrace,
  resolveRunDir,
  saveBaseline,
} from '../core/storage.js';
import type { AgentTrace } from '../core/types.js';
import { diffTraces } from '../diff.js';
import { writeTraceReport } from '../report.js';
import { PassThrough } from 'node:stream';
import { createRecorder } from '../core/recorder.js';
import { createMcpInterceptor } from '../core/mcp.js';


const program = new Command();

function timeline(trace: AgentTrace) {
  const lines = [
    `${pc.bold('Run')} ${trace.runId}`,
    `Status: ${trace.status}`,
    `Duration: ${trace.durationMs ?? 0}ms`,
    `Events: ${trace.events.length}`,
  ];

  if (trace.metadata) lines.push(`Metadata: ${JSON.stringify(trace.metadata)}`);

  lines.push('', pc.bold('Timeline'));
  for (const event of trace.events) lines.push(`- ${event.timestamp} ${pc.yellow(event.type)} ${event.name ?? ''}`);

  if (trace.output !== undefined) lines.push('', `${pc.bold('Output')}: ${JSON.stringify(trace.output)}`);
  return lines.join('\n');
}

function fmtDuration(ms: number | undefined): string {
  if (ms === undefined) return 'n/a';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function isEnoent(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isEnoent(error)) return false;
    throw error;
  }
}

async function resolveLatestTrace(): Promise<string | undefined> {
  try {
    return await latestTracePath();
  } catch (error) {
    const message = isEnoent(error)
      ? `No traces found. Run "agentrec init" to get started.`
      : error instanceof Error
        ? error.message
        : String(error);
    console.error(pc.yellow(message));
    process.exitCode = 1;
    return undefined;
  }
}

function fmtStatus(status: string): string {
  return status === 'completed' ? pc.green(status) : status === 'failed' ? pc.red(status) : pc.yellow(status);
}

program.name('agentrec').description('Black box recorder for AI agents').version('0.1.0');

program
  .command('init')
  .description('Create .agentrec folders')
  .action(async () => {
    await mkdir('.agentrec/runs', { recursive: true });
    await mkdir('.agentrec/baselines', { recursive: true });
    await writeFile('.agentrec/config.json', `${JSON.stringify({ schemaVersion: 1, runDir: '.agentrec/runs' }, null, 2)}\n`);
    console.log('Initialized .agentrec/');
  });

program
  .command('show <trace>')
  .description('Show trace timeline')
  .action(async (path) => console.log(timeline(await readTrace(path))));

program
  .command('report <trace>')
  .description('Generate a self-contained HTML trace report')
  .option('-o, --output <file>', 'Output HTML file')
  .option('--no-redaction', 'Disable default report redaction')
  .action(async (path, options: { output?: string; redaction?: boolean }) => {
    const trace = await readTrace(path);
    const output = await writeTraceReport(trace, path, {
      output: options.output,
      redaction: options.redaction === false ? false : undefined,
    });
    console.log(`Report written to ${output}`);
  });

program
  .command('list')
  .description('List recent traces with status and timings')
  .option('-n, --limit <n>', 'Max traces to show (default 10)')
  .option('-d, --dir <dir>', 'Trace directory (default: .agentrec/runs)')
  .action(async (options: { limit?: string; dir?: string }) => {
    const dir = resolveRunDir(options.dir);
    const limit = parseInt(options.limit ?? '10', 10);

    let files: { path: string; mtime: number }[];
    try {
      files = await listTraces(dir);
    } catch {
      console.log(pc.yellow(`No traces found in ${dir}. Run "agentrec init" to get started.`));
      return;
    }

    if (!files.length) {
      console.log(pc.yellow(`No traces found in ${dir}. Record an agent run first.`));
      return;
    }

    const sorted = files.slice(0, limit);

    console.log(pc.bold(`Recent traces (${sorted.length})\n`));
    for (const { path } of sorted) {
      try {
        const trace = await readTrace(path);
        console.log(
          `${pc.dim(trace.runId)}  ${fmtStatus(trace.status)}  ${pc.dim(fmtDuration(trace.durationMs))}  ${pc.dim(
            `${trace.events.length} events`,
          )}  ${pc.dim(path)}`,
        );
      } catch {
        console.log(`${pc.red('unreadable')}  ${pc.dim(path)}`);
      }
    }
    console.log('');
  });

program
  .command('latest')
  .description('Print the path of the newest finished trace (skips still-running runs)')
  .option('-d, --dir <dir>', 'Trace directory (default: .agentrec/runs)')
  .action(async (options: { dir?: string }) => {
    const dir = resolveRunDir(options.dir);
    try {
      console.log(await latestTracePath(dir));
    } catch (error) {
      const message =
        error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? `No traces found in ${dir}. Run "agentrec init" to get started.`
          : error instanceof Error
            ? error.message
            : String(error);
      console.error(pc.yellow(message));
      process.exitCode = 1;
    }
  });

program
  .command('replay <trace>')
  .description('Print recorded replay outputs')
  .action(async (path) => {
    const trace = await readTrace(path);
    console.log(`Replay plan for ${trace.runId}`);
    for (const event of trace.events.filter((event) => event.type === 'llm.response' || event.type === 'tool.result')) {
      console.log(`- ${event.type} ${event.name ?? ''}: ${JSON.stringify(event.data)}`);
    }
  });

program
  .command('diff <a> <b>')
  .description('Diff two traces')
  .action(async (a, b) => {
    const diff = diffTraces(await readTrace(a), await readTrace(b));
    if (diff.equal) {
      console.log(pc.green('No regression detected. Traces match.'));
    } else {
      console.log([pc.red('Regression detected:'), ...diff.differences.map((difference) => `- ${difference}`)].join('\n'));
      process.exitCode = 1;
    }
  });

const baselineGroup = program.command('baseline').description('Manage golden baselines');

baselineGroup
  .command('create <name> [trace]')
  .description('Save a trace as a named baseline')
  .option('-d, --dir <dir>', 'Baseline directory (default: .agentrec/baselines)')
  .action(async (name: string, trace: string | undefined, options: { dir?: string }) => {
    const dir = options.dir ?? DEFAULT_BASELINE_DIR;

    if (await exists(baselinePath(name, dir))) {
      console.error(`Baseline "${name}" exists. Use "agentrec baseline update ${name}" to change it.`);
      process.exitCode = 1;
      return;
    }

    const source = trace ?? (await resolveLatestTrace());
    if (!source) return;

    const parsed = await readTrace(source);
    const path = await saveBaseline(name, parsed, dir);
    console.log(`Baseline "${name}" created from ${source} -> ${path}`);
  });

baselineGroup
  .command('update <name> [trace]')
  .description('Update an existing baseline, printing the diff before overwriting')
  .option('-d, --dir <dir>', 'Baseline directory (default: .agentrec/baselines)')
  .action(async (name: string, trace: string | undefined, options: { dir?: string }) => {
    const dir = options.dir ?? DEFAULT_BASELINE_DIR;
    const existingPath = baselinePath(name, dir);

    if (!(await exists(existingPath))) {
      console.error(`Baseline "${name}" does not exist. Use "agentrec baseline create ${name}" first.`);
      process.exitCode = 1;
      return;
    }

    const source = trace ?? (await resolveLatestTrace());
    if (!source) return;

    const [existing, incoming] = await Promise.all([readTrace(existingPath), readTrace(source)]);
    const diff = diffTraces(existing, incoming);

    if (diff.equal) {
      console.log(`Baseline "${name}" already matches; nothing to update.`);
      return;
    }

    console.log([`Updating baseline "${name}":`, ...diff.differences.map((difference) => `- ${difference}`)].join('\n'));
    const path = await saveBaseline(name, incoming, dir);
    console.log(`Baseline "${name}" updated -> ${path}`);
  });

baselineGroup
  .command('list')
  .description('List saved baselines')
  .option('-d, --dir <dir>', 'Baseline directory (default: .agentrec/baselines)')
  .action(async (options: { dir?: string }) => {
    const dir = options.dir ?? DEFAULT_BASELINE_DIR;
    const names = await listBaselineNames(dir);

    if (!names.length) {
      console.log(pc.yellow(`No baselines yet. Create one with "agentrec baseline create <name>".`));
      return;
    }

    console.log(pc.bold(`Baselines (${names.length})\n`));
    for (const name of names) {
      try {
        const trace = await readTrace(baselinePath(name, dir));
        console.log(
          `${pc.dim(name)}  ${fmtStatus(trace.status)}  ${pc.dim(fmtDuration(trace.durationMs))}  ${pc.dim(`${trace.events.length} events`)}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${pc.red('unreadable')}  ${pc.dim(name)}  ${pc.dim(message)}`);
      }
    }
    console.log('');
  });

program
  .command('record')
  .allowUnknownOption(true)
  .argument('[cmd...]')
  .description('Run command with agentrec env vars')
  .action(async (cmd: string[]) => {
    const [command, ...args] = cmd;
    if (!command) throw new Error('Usage: agentrec record -- <command>');

    await execa(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        AGENTREC_ENABLED: '1',
        AGENTREC_RUN_DIR: process.env.AGENTREC_RUN_DIR || DEFAULT_RUN_DIR,
      },
    });
    console.log('Command completed. Check .agentrec/runs for generated traces.');
  });

program
  .command('test <baseline>')
  .allowUnknownOption(true)
  .argument('[cmd...]')
  .description('Run command and compare trace produced during this invocation')
  .action(async (baselinePath: string, cmd: string[]) => {
    const [command, ...args] = cmd;
    if (!command) throw new Error('Usage: agentrec test <baseline> -- <command>');

    const baseline = await readTrace(baselinePath);
    const runDir = await mkdtemp(join(tmpdir(), 'agentrec-test-'));

    try {
      await execa(command, args, {
        stdio: 'inherit',
        env: {
          ...process.env,
          AGENTREC_ENABLED: '1',
          AGENTREC_RUN_DIR: runDir,
        },
      });

      const latest = await readTrace(await latestTracePath(runDir));
      const diff = diffTraces(baseline, latest);
      console.log(diff.equal ? 'Regression test passed.' : diff.differences.join('\n'));
      process.exitCode = diff.equal ? 0 : 1;
    } catch (error) {
      console.log(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 2;
    } finally {
      await rm(runDir, { recursive: true, force: true });
    }
  });

program
  .command('mcp')
  .allowUnknownOption(true)
  .argument('[cmd...]')
  .description('Run MCP server process and proxy Stdio JSON-RPC traffic to record trace')
  .option('-d, --dir <dir>', 'Trace directory (default: .agentrec/runs)')
  .action(async (cmd: string[], options: { dir?: string }) => {
    const [command, ...args] = cmd;
    if (!command) throw new Error('Usage: agentrec mcp -- <command>');

    const dir = resolveRunDir(options.dir);
    const recorder = createRecorder({ runDir: dir });
    recorder.startRun({ command: cmd.join(' ') });

    const pendingCalls = new Map<string | number, string>();

    const child = execa(command, args, {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const stdinInterceptorStream = new PassThrough();
    const stdoutInterceptorStream = new PassThrough();

    // Pipe stdin from parent process to child's stdin
    process.stdin.pipe(stdinInterceptorStream);
    process.stdin.pipe(child.stdin!);

    // Pipe child's stdout to parent's stdout
    child.stdout!.pipe(stdoutInterceptorStream);
    child.stdout!.pipe(process.stdout);

    // Setup interceptors
    createMcpInterceptor(stdinInterceptorStream, (msg) => {
      if (msg && msg.method === 'tools/call') {
        const id = msg.id;
        const name = msg.params?.name;
        const toolArgs = msg.params?.arguments;
        if (id !== undefined && name) {
          pendingCalls.set(id, name);
          recorder.recordToolCall(name, toolArgs as Record<string, unknown> | undefined);
        }
      }
    });

    createMcpInterceptor(stdoutInterceptorStream, (msg) => {
      if (msg && msg.id !== undefined) {
        const name = pendingCalls.get(msg.id);
        if (name) {
          pendingCalls.delete(msg.id);
          if (msg.result !== undefined) {
            recorder.recordToolResult(name, msg.result as Record<string, unknown> | undefined);
          } else if (msg.error !== undefined) {
            recorder.recordToolResult(name, { error: msg.error } as Record<string, unknown>);
          }
        }
      }
    });

    try {
      const result = await child;
      await recorder.finishRun({ exitCode: result.exitCode });
    } catch (error) {
      await recorder.failRun(error);
      console.error(`MCP server failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });




try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
