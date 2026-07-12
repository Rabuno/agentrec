import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateTrace } from './schema.js';
import type { AgentTrace } from './types.js';

export const DEFAULT_RUN_DIR = '.agentrec/runs';
export const DEFAULT_BASELINE_DIR = '.agentrec/baselines';

export function baselinePath(name: string, dir = DEFAULT_BASELINE_DIR) {
  return join(dir, `${name}.json`);
}

export async function saveBaseline(name: string, trace: AgentTrace, dir = DEFAULT_BASELINE_DIR) {
  validateTrace(trace);
  await mkdir(dir, { recursive: true });

  const path = baselinePath(name, dir);
  await writeFile(path, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  return path;
}

export async function listBaselineNames(dir = DEFAULT_BASELINE_DIR): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length));
  } catch (error) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

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
