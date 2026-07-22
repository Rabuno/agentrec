import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { saveTrace } from '../src/core/storage.js';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-list-'));
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

describe('cli list', () => {
  it('prints recorded traces newest-first', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_older' }), dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveTrace(makeTrace({ runId: 'run_newer' }), dir);

      const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'list', '--dir', dir]);
      expect(stdout).toContain('run_newer');
      expect(stdout).toContain('run_older');
      expect(stdout.indexOf('run_newer')).toBeLessThan(stdout.indexOf('run_older'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it('honors --limit', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_a' }), dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await saveTrace(makeTrace({ runId: 'run_b' }), dir);

      const { stdout } = await execa('node', [
        '--import',
        'tsx',
        'src/cli/index.ts',
        'list',
        '--dir',
        dir,
        '--limit',
        '1',
      ]);
      expect(stdout).toContain('run_b');
      expect(stdout).not.toContain('run_a');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it('prints a clean message when the trace dir does not exist', async () => {
    const dir = join(tmpdir(), `agentrec-cli-list-missing-${process.pid}`);

    const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'list', '--dir', dir]);
    expect(stdout).toContain('agentrec init');
  }, 15000);
});
