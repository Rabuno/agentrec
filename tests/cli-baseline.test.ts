import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { saveTrace } from '../src/core/storage.js';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';

async function tempDir(prefix: string) {
  return mkdtemp(join(tmpdir(), prefix));
}

function makeTrace(overrides: Partial<AgentTrace> & { runId: string }): AgentTrace {
  return {
    schemaVersion: TRACE_SCHEMA_VERSION,
    status: 'completed',
    startedAt: new Date(0).toISOString(),
    events: [],
    ...overrides,
  };
}

describe('cli baseline', () => {
  it('create writes a baseline file from an explicit source trace', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const source = await saveTrace(makeTrace({ runId: 'run_1', output: { answer: 'world' } }), runDir);

      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', source, '--dir', baselineDir]);

      const written = JSON.parse(await readFile(join(baselineDir, 'happy-path.json'), 'utf8'));
      expect(written.runId).toBe('run_1');
      expect(written.output).toEqual({ answer: 'world' });
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('create refuses to overwrite an existing baseline', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const first = await saveTrace(makeTrace({ runId: 'run_1', output: { answer: 'world' } }), runDir);
      const second = await saveTrace(makeTrace({ runId: 'run_2', output: { answer: 'changed' } }), runDir);

      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', first, '--dir', baselineDir]);

      await expect(
        execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', second, '--dir', baselineDir]),
      ).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('update') });

      const written = JSON.parse(await readFile(join(baselineDir, 'happy-path.json'), 'utf8'));
      expect(written.runId).toBe('run_1');
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('update prints the diff and overwrites when the trace changed', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const first = await saveTrace(makeTrace({ runId: 'run_1', output: { answer: 'world' } }), runDir);
      const second = await saveTrace(makeTrace({ runId: 'run_2', output: { answer: 'changed' } }), runDir);

      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', first, '--dir', baselineDir]);
      const { stdout } = await execa('node', [
        '--import', 'tsx', 'src/cli/index.ts', 'baseline', 'update', 'happy-path', second, '--dir', baselineDir,
      ]);

      expect(stdout).toContain('output changed');
      const written = JSON.parse(await readFile(join(baselineDir, 'happy-path.json'), 'utf8'));
      expect(written.runId).toBe('run_2');
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('update is a no-op when the trace already matches', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const first = await saveTrace(makeTrace({ runId: 'run_1', output: { answer: 'world' } }), runDir);
      const identical = await saveTrace(makeTrace({ runId: 'run_2', output: { answer: 'world' } }), runDir);

      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', first, '--dir', baselineDir]);
      const { stdout } = await execa('node', [
        '--import', 'tsx', 'src/cli/index.ts', 'baseline', 'update', 'happy-path', identical, '--dir', baselineDir,
      ]);

      expect(stdout).toContain('already matches');
      const written = JSON.parse(await readFile(join(baselineDir, 'happy-path.json'), 'utf8'));
      expect(written.runId).toBe('run_1');
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('update on a missing baseline exits non-zero pointing to create', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const trace = await saveTrace(makeTrace({ runId: 'run_1' }), runDir);

      await expect(
        execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'update', 'nope', trace, '--dir', baselineDir]),
      ).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('create') });
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('list prints created baseline names with status', async () => {
    const runDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const trace = await saveTrace(makeTrace({ runId: 'run_1', status: 'completed' }), runDir);
      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', trace, '--dir', baselineDir]);

      const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'list', '--dir', baselineDir]);

      expect(stdout).toContain('happy-path');
      expect(stdout).toContain('completed');
    } finally {
      await rm(runDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('create exits 1 with a clean message when no trace arg and no runs exist', async () => {
    const emptyRunDir = await tempDir('agentrec-cli-baseline-run-');
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      await expect(
        execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'create', 'happy-path', '--dir', baselineDir], {
          env: { ...process.env, AGENTREC_RUN_DIR: emptyRunDir },
        }),
      ).rejects.toMatchObject({ exitCode: 1 });

      await expect(readFile(join(baselineDir, 'happy-path.json'), 'utf8')).rejects.toThrow();
    } finally {
      await rm(emptyRunDir, { recursive: true, force: true });
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);

  it('list prints a hint when there are no baselines yet', async () => {
    const baselineDir = await tempDir('agentrec-cli-baseline-dir-');
    try {
      const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'baseline', 'list', '--dir', baselineDir]);
      expect(stdout).toContain('No baselines yet');
    } finally {
      await rm(baselineDir, { recursive: true, force: true });
    }
  }, 15000);
});
