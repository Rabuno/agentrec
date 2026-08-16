import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { readTrace, latestTracePath } from '../src/core/storage.js';

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'agentrec-cli-record-'));
}

describe('cli record', () => {
  it('spawns a child process, records a trace to the run dir, and exits cleanly', async () => {
    const dir = await tempDir();
    const scriptPath = join(dir, 'test-agent.ts');
    
    // Write a tiny agent script that records a run
    const agentCode = `
      import { createRecorder } from '${join(process.cwd(), 'src/index.ts').replace(/\\/g, '/')}';
      async function main() {
        const recorder = createRecorder();
        recorder.startRun({ input: 'hello' });
        await recorder.finishRun({ output: 'world' });
      }
      main();
    `;
    await writeFile(scriptPath, agentCode, 'utf8');

    try {
      // Run agentrec record
      const result = await execa('node', [
        '--import', 'tsx',
        'src/cli/index.ts',
        'record',
        '--',
        'node', '--import', 'tsx', scriptPath
      ], {
        env: {
          ...process.env,
          AGENTREC_RUN_DIR: dir,
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Command completed');

      // Verify a trace was actually generated in the temp run dir
      const latestPath = await latestTracePath(dir);
      const trace = await readTrace(latestPath);
      expect(trace.input).toEqual({ input: 'hello' });
      expect(trace.output).toEqual({ output: 'world' });
      expect(trace.status).toBe('completed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30000);
});
