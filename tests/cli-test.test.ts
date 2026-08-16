import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { createRecorder, saveTrace } from '../src/index.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-test-'));
}

describe('cli test', () => {
  it('passes (exit 0) when the run trace matches the baseline', async () => {
    const dir = await tempDir();
    const scriptPath = join(dir, 'test-agent.ts');

    // Create a real baseline trace using the recorder
    const recorder = createRecorder({ runDir: dir });
    recorder.startRun('match');
    const baselineTrace = await recorder.finishRun('match');
    const baselinePath = await saveTrace(baselineTrace, dir);

    // Create script that matches baseline
    const agentCode = `
      import { createRecorder } from '${join(process.cwd(), 'src/index.ts').replace(/\\/g, '/')}';
      async function main() {
        const recorder = createRecorder();
        recorder.startRun('match');
        await recorder.finishRun('match');
      }
      main();
    `;
    await writeFile(scriptPath, agentCode, 'utf8');

    try {
      const result = await execa('node', [
        '--import', 'tsx',
        'src/cli/index.ts',
        'test',
        baselinePath,
        '--',
        'node', '--import', 'tsx', scriptPath
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Regression test passed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('fails (exit 1) when the run trace differs from the baseline', async () => {
    const dir = await tempDir();
    const scriptPath = join(dir, 'test-agent.ts');

    // Create baseline
    const recorder = createRecorder({ runDir: dir });
    recorder.startRun('match');
    const baselineTrace = await recorder.finishRun('match');
    const baselinePath = await saveTrace(baselineTrace, dir);

    // Create script that differs from baseline
    const agentCode = `
      import { createRecorder } from '${join(process.cwd(), 'src/index.ts').replace(/\\/g, '/')}';
      async function main() {
        const recorder = createRecorder();
        recorder.startRun('different');
        await recorder.finishRun('different');
      }
      main();
    `;
    await writeFile(scriptPath, agentCode, 'utf8');

    try {
      // execa will reject for exit code 1, so we expect rejects
      await expect(
        execa('node', [
          '--import', 'tsx',
          'src/cli/index.ts',
          'test',
          baselinePath,
          '--',
          'node', '--import', 'tsx', scriptPath
        ])
      ).rejects.toMatchObject({
        exitCode: 1,
        stdout: expect.stringContaining('input'), // Should output the difference
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);

  it('errors (exit 2) when the command itself fails', async () => {
    const dir = await tempDir();
    const recorder = createRecorder({ runDir: dir });
    recorder.startRun('match');
    const baselineTrace = await recorder.finishRun('match');
    const baselinePath = await saveTrace(baselineTrace, dir);

    try {
      await expect(
        execa('node', [
          '--import', 'tsx',
          'src/cli/index.ts',
          'test',
          baselinePath,
          '--',
          'node', '-e', 'process.exit(5)' // fails with non-zero exit code
        ])
      ).rejects.toMatchObject({
        exitCode: 2,
        stdout: expect.stringContaining('Command failed'),
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
