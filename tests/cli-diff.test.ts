import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { createRecorder, saveTrace } from '../src/index.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-diff-'));
}

describe('CLI diff command', () => {
  it('outputs human-readable match message and exits with 0 on matching traces', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ query: 'test' });
      const trace1 = await recorder.finishRun({ answer: '42' });
      const path1 = await saveTrace(trace1, dir);

      const result = await execa('node', [
        '--import', 'tsx',
        'src/cli/index.ts',
        'diff',
        path1,
        path1,
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No regression detected. Traces match.');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('outputs human-readable regression list and exits with 1 on differing traces', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ query: 'test' });
      const trace1 = await recorder.finishRun({ answer: '42' });
      const path1 = await saveTrace(trace1, dir);

      recorder.startRun({ query: 'test' });
      const trace2 = await recorder.finishRun({ answer: '99' });
      const path2 = await saveTrace(trace2, dir);

      await expect(
        execa('node', [
          '--import', 'tsx',
          'src/cli/index.ts',
          'diff',
          path1,
          path2,
        ])
      ).rejects.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('Regression detected:'),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('outputs valid JSON and exits with 0 when --json is passed and traces match', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ query: 'test' });
      const trace1 = await recorder.finishRun({ answer: '42' });
      const path1 = await saveTrace(trace1, dir);

      const result = await execa('node', [
        '--import', 'tsx',
        'src/cli/index.ts',
        'diff',
        path1,
        path1,
        '--json',
      ]);

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toEqual({
        equal: true,
        differences: [],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('outputs valid JSON and exits with 1 when --json is passed and traces differ', async () => {
    const dir = await tempDir();
    try {
      const recorder = createRecorder({ runDir: dir });
      recorder.startRun({ query: 'test' });
      const trace1 = await recorder.finishRun({ answer: '42' });
      const path1 = await saveTrace(trace1, dir);

      recorder.startRun({ query: 'test' });
      const trace2 = await recorder.finishRun({ answer: '99' });
      const path2 = await saveTrace(trace2, dir);

      let stdout = '';
      try {
        await execa('node', [
          '--import', 'tsx',
          'src/cli/index.ts',
          'diff',
          path1,
          path2,
          '--json',
        ]);
      } catch (error: any) {
        expect(error.exitCode).toBe(1);
        stdout = error.stdout;
      }

      const parsed = JSON.parse(stdout.trim());
      expect(parsed.equal).toBe(false);
      expect(Array.isArray(parsed.differences)).toBe(true);
      expect(parsed.differences.length).toBeGreaterThan(0);
      expect(parsed.differences).toContain('final output changed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
