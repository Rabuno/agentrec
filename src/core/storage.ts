import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateTrace } from './schema.js';
import type { AgentTrace } from './types.js';
export const DEFAULT_RUN_DIR = '.agentrec/runs';
export async function saveTrace(trace:AgentTrace, runDir=process.env.AGENTREC_RUN_DIR||DEFAULT_RUN_DIR){ validateTrace(trace); await mkdir(runDir,{recursive:true}); const path=join(runDir,`${trace.runId}.json`); await writeFile(path, JSON.stringify(trace,null,2)+'\n','utf8'); return path; }
export async function readTrace(path:string):Promise<AgentTrace>{ return validateTrace(JSON.parse(await readFile(path,'utf8'))) as AgentTrace; }
export async function latestTracePath(runDir=process.env.AGENTREC_RUN_DIR||DEFAULT_RUN_DIR){ const files=(await readdir(runDir)).filter(f=>f.endsWith('.json')).map(f=>join(runDir,f)); if(!files.length) throw new Error(`No trace files found in ${runDir}`); const withTimes=await Promise.all(files.map(async f=>[f,(await stat(f)).mtimeMs] as const)); withTimes.sort((a,b)=>a[1]-b[1]); return withTimes.at(-1)![0]; }
