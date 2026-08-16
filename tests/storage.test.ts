import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_RUN_DIR, latestTracePath, listTraces, resolveRunDir, saveTrace } from '../src/core/storage.js';
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

  it('skips a corrupt trace file and returns the newest valid completed one', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_older', status: 'completed' }), dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await writeFile(join(dir, 'run_corrupt.json'), 'not json at all!', 'utf8');

      const path = await latestTracePath(dir);
      expect(path).toBe(join(dir, 'run_older.json'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when every trace on disk is corrupt', async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir, 'run_corrupt.json'), 'invalid json', 'utf8');
      await expect(latestTracePath(dir)).rejects.toThrow('No completed trace found');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('listTraces', () => {
  it('sorts trace files newest-first by mtime', async () => {
    const dir = await tempDir();
    try {
      const older = await saveTrace(makeTrace({ runId: 'run_older' }), dir);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const newer = await saveTrace(makeTrace({ runId: 'run_newer' }), dir);

      const files = await listTraces(dir);
      expect(files.map((f) => f.path)).toEqual([newer, older]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('ignores non-.json files', async () => {
    const dir = await tempDir();
    try {
      await saveTrace(makeTrace({ runId: 'run_a' }), dir);
      await writeFile(join(dir, 'notes.txt'), 'not a trace', 'utf8');

      const files = await listTraces(dir);
      expect(files).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty array for an empty dir', async () => {
    const dir = await tempDir();
    try {
      await expect(listTraces(dir)).resolves.toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws for a missing dir', async () => {
    const dir = join(tmpdir(), `agentrec-storage-missing-${process.pid}`);
    await expect(listTraces(dir)).rejects.toThrow();
  });
});

describe('resolveRunDir', () => {
  const original = process.env.AGENTREC_RUN_DIR;
  afterEach(() => {
    if (original === undefined) delete process.env.AGENTREC_RUN_DIR;
    else process.env.AGENTREC_RUN_DIR = original;
  });

  it('prefers an explicit dir over the env var', () => {
    process.env.AGENTREC_RUN_DIR = '/env/dir';
    expect(resolveRunDir('/explicit/dir')).toBe('/explicit/dir');
  });

  it('falls back to the env var when no explicit dir is given', () => {
    process.env.AGENTREC_RUN_DIR = '/env/dir';
    expect(resolveRunDir()).toBe('/env/dir');
  });

  it('falls back to the default when the env var is empty', () => {
    process.env.AGENTREC_RUN_DIR = '';
    expect(resolveRunDir()).toBe(DEFAULT_RUN_DIR);
  });
});
