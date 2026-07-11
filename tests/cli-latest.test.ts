import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { saveTrace } from '../src/core/storage.js';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-latest-'));
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

describe('cli latest', () => {
  it('prints the path of the newest completed trace', async () => {
    const dir = await tempDir();
    try {
      const older = await saveTrace(makeTrace({ runId: 'run_older' }), dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await saveTrace(makeTrace({ runId: 'run_newer' }), dir);

      const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'latest', '--dir', dir]);
      expect(stdout.trim()).toBe(newer);
      expect(stdout.trim()).not.toBe(older);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it('treats a failed trace as finished, not just a completed one', async () => {
    const dir = await tempDir();
    try {
      const failed = await saveTrace(makeTrace({ runId: 'run_failed', status: 'failed' }), dir);

      const { stdout } = await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'latest', '--dir', dir]);
      expect(stdout.trim()).toBe(failed);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it('exits non-zero with a clean message when the trace dir does not exist', async () => {
    const dir = join(tmpdir(), `agentrec-cli-latest-missing-${process.pid}`);

    await expect(
      execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'latest', '--dir', dir]),
    ).rejects.toMatchObject({ exitCode: 1, stderr: expect.stringContaining('agentrec init') });
  }, 15000);
});
