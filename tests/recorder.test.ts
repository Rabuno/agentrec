import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRecorder } from '../src/core/recorder.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-'));
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
});
