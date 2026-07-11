import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateTrace } from './schema.js';
import type { AgentTrace } from './types.js';

export const DEFAULT_RUN_DIR = '.agentrec/runs';

export async function saveTrace(trace: AgentTrace, runDir = process.env.AGENTREC_RUN_DIR || DEFAULT_RUN_DIR) {
  validateTrace(trace);
  await mkdir(runDir, { recursive: true });

  const path = join(runDir, `${trace.runId}.json`);
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  return path;
}

export async function readTrace(path: string): Promise<AgentTrace> {
  return validateTrace(JSON.parse(await readFile(path, 'utf8'))) as AgentTrace;
}

export async function latestTracePath(runDir = process.env.AGENTREC_RUN_DIR || DEFAULT_RUN_DIR) {
  const files = (await readdir(runDir)).filter((file) => file.endsWith('.json')).map((file) => join(runDir, file));

  if (!files.length) throw new Error(`No trace files found in ${runDir}`);

  const withTimes = await Promise.all(files.map(async (file) => [file, (await stat(file)).mtimeMs] as const));
  withTimes.sort((a, b) => b[1] - a[1]);

  // Incremental persistence can leave a trace file mid-run (status: 'running') on disk;
  // skip those and return the newest run that actually finished.
  for (const [file] of withTimes) {
    const trace = await readTrace(file);
    if (trace.status !== 'running') return file;
  }

  throw new Error(`No completed trace found in ${runDir}; the latest run may still be in progress or crashed before finishing.`);
}
