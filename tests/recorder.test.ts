import { readFile, readdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRecorder } from '../src/core/recorder.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-'));
}

async function waitForTraceFile(path: string, predicate: (trace: any) => boolean, timeoutMs = 2000) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      if (predicate(parsed)) return parsed;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw lastError ?? new Error(`Timed out waiting for condition on ${path}`);
}

describe('recorder', () => {
  it('records ordered completed trace', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ q: 'hello' });
      recorder.recordToolCall('search', { query: 'hello' });
      recorder.recordToolResult('search', { result: 'world' });

      const trace = await recorder.finishRun({ answer: 'world' });

      expect(trace.status).toBe('completed');
      expect(trace.events.map((event) => event.type)).toEqual(['run.started', 'tool.call', 'tool.result', 'run.finished']);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('blocks events and repeated terminal transitions after completion', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun();
    await recorder.finishRun({ ok: true });

    expect(() => recorder.recordAgentStep('late')).toThrow('after run is completed');
    await expect(recorder.finishRun({ ok: true })).rejects.toThrow('already completed');
    await expect(recorder.failRun(new Error('late'))).rejects.toThrow('already completed');
  });

  it('redacts common secrets before returning and saving terminal traces', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ prompt: 'use sk-or-v1-secretsecretsecretsecret' }, { apiKey: 'abc123' });
      recorder.recordToolCall('http', { authorization: 'Bearer secretsecretsecretsecret' });

      const trace = await recorder.finishRun({ token: 'ghp_secretsecretsecretsecret' });
      const saved = await readFile(join(dir, `${trace.runId}.json`), 'utf8');

      expect(trace.metadata?.apiKey).toBe('[REDACTED]');
      expect(trace.output).toEqual({ token: '[REDACTED]' });
      expect(saved).not.toContain('secretsecretsecretsecret');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('redacts failed run error messages before saving', async () => {
    const recorder = createRecorder({ autoSave: false });
    recorder.startRun();

    const trace = await recorder.failRun(new Error('request failed with Bearer secretsecretsecretsecret'));

    expect(trace.status).toBe('failed');
    expect(trace.events.at(-1)?.data?.message).toBe('request failed with [REDACTED]');
  });

  it('persists incrementally so a crash before finishRun keeps recorded events on disk', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      const trace = recorder.startRun({ q: 'hello' });
      recorder.recordToolCall('search', { query: 'hello' });
      recorder.recordToolResult('search', { result: 'world' });
      // no finishRun/failRun call — simulates a crash mid-run

      const path = join(dir, `${trace.runId}.json`);
      const saved = await waitForTraceFile(path, (t) => t.events.length >= 3);

      expect(saved.status).toBe('running');
      expect(saved.events.map((event: { type: string }) => event.type)).toEqual([
        'run.started',
        'tool.call',
        'tool.result',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('redacts incrementally saved traces too, not just the final save', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      const trace = recorder.startRun();
      recorder.recordToolCall('http', { authorization: 'Bearer secretsecretsecretsecret' });
      // no finishRun/failRun call — simulates a crash mid-run

      const path = join(dir, `${trace.runId}.json`);
      const saved = await waitForTraceFile(path, (t) => t.events.length >= 2);

      expect(JSON.stringify(saved)).not.toContain('secretsecretsecretsecret');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('does not corrupt or drop events when they fire rapidly back to back', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun();
      for (let i = 0; i < 25; i += 1) {
        recorder.recordAgentStep(`step-${i}`);
      }
      const trace = await recorder.finishRun({ ok: true });

      const saved = JSON.parse(await readFile(join(dir, `${trace.runId}.json`), 'utf8'));
      expect(saved.events.map((event: { name?: string }) => event.name)).toEqual([
        'run',
        ...Array.from({ length: 25 }, (_, i) => `step-${i}`),
        'run',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('surfaces a stuck incremental write failure instead of losing it, without blocking the run from finishing', async () => {
    const dir = await tempDir();
    try {
      // a file, not a directory, at this path — every write attempt against it fails
      const blockedPath = join(dir, 'blocked');
      await writeFile(blockedPath, 'occupied');

      const options = { runDir: blockedPath };
      const recorder = createRecorder(options);
      recorder.startRun();
      recorder.recordToolCall('search', { query: 'hello' });

      // let the failing incremental writes settle before the run finishes
      await new Promise((resolve) => setTimeout(resolve, 150));

      const goodDir = join(dir, 'good');
      options.runDir = goodDir;

      await expect(recorder.finishRun({ ok: true })).rejects.toThrow();

      const files = await readdir(goodDir);
      expect(files).toHaveLength(1);
      const saved = JSON.parse(await readFile(join(goodDir, files[0]), 'utf8'));
      expect(saved.status).toBe('completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
