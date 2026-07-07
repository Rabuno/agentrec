import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestTracePath, saveTrace } from '../src/core/storage.js';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-storage-'));
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

describe('latestTracePath', () => {
  it('skips a mid-run trace (status: running) and returns the newest completed one', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_older', status: 'completed' }), dir);
      // simulate incremental persistence: the newest file on disk by mtime is still running
      await saveTrace(makeTrace({ runId: 'run_newer', status: 'running' }), dir);

      const path = await latestTracePath(dir);
      expect(path).toBe(join(dir, 'run_older.json'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when every trace on disk is still running', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_stuck', status: 'running' }), dir);
      await expect(latestTracePath(dir)).rejects.toThrow('still be in progress or crashed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
