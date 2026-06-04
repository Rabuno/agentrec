#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import pc from 'picocolors';
import { Command } from 'commander';
import { readTrace, latestTracePath } from '../core/storage.js';
import { diffTraces } from '../diff.js';
import { writeTraceReport } from '../report.js';
const program=new Command();
function timeline(t:any){ const lines=[`${pc.bold('Run')} ${t.runId}`,`Status: ${t.status}`,`Duration: ${t.durationMs??0}ms`,`Events: ${t.events.length}`]; if(t.metadata) lines.push(`Metadata: ${JSON.stringify(t.metadata)}`); lines.push('',pc.bold('Timeline')); for(const e of t.events) lines.push(`- ${e.timestamp} ${pc.yellow(e.type)} ${e.name??''}`); if(t.output!==undefined) lines.push('',`${pc.bold('Output')}: ${JSON.stringify(t.output)}`); return lines.join('\n'); }
program.name('agentrec').description('Black box recorder for AI agents').version('0.1.0');
program.command('init').description('Create .agentrec folders').action(async()=>{ await mkdir('.agentrec/runs',{recursive:true}); await mkdir('.agentrec/baselines',{recursive:true}); await writeFile('.agentrec/config.json',JSON.stringify({schemaVersion:1,runDir:'.agentrec/runs'},null,2)+'\n'); console.log('Initialized .agentrec/'); });
program.command('show <trace>').description('Show trace timeline').action(async(p)=>console.log(timeline(await readTrace(p))));
program.command('report <trace>').description('Generate a self-contained HTML trace report').option('-o, --output <file>','Output HTML file').action(async(p,options:{output?:string})=>{ const trace=await readTrace(p); const output=await writeTraceReport(trace,p,{output:options.output}); console.log(`Report written to ${output}`); });
program.command('replay <trace>').description('Print recorded replay outputs').action(async(p)=>{ const t=await readTrace(p); console.log(`Replay plan for ${t.runId}`); for(const e of t.events.filter(e=>e.type==='llm.response'||e.type==='tool.result')) console.log(`- ${e.type} ${e.name??''}: ${JSON.stringify(e.data)}`); });
program.command('diff <a> <b>').description('Diff two traces').action(async(a,b)=>{ const diff=diffTraces(await readTrace(a),await readTrace(b)); if(diff.equal) console.log(pc.green('No regression detected. Traces match.')); else { console.log([pc.red('Regression detected:'),...diff.differences.map(d=>`- ${d}`)].join('\n')); process.exitCode=1; } });
program.command('record').allowUnknownOption(true).argument('[cmd...]').description('Run command with agentrec env vars').action(async(cmd:string[])=>{ const [c,...args]=cmd; if(!c) throw new Error('Usage: agentrec record -- <command>'); await execa(c,args,{stdio:'inherit',env:{...process.env,AGENTREC_ENABLED:'1',AGENTREC_RUN_DIR:process.env.AGENTREC_RUN_DIR||'.agentrec/runs'}}); console.log('Command completed. Check .agentrec/runs for generated traces.'); });
program.command('test <baseline>').allowUnknownOption(true).argument('[cmd...]').description('Run command and compare latest trace').action(async(base:string,cmd:string[])=>{ const [c,...args]=cmd; if(!c) throw new Error('Usage: agentrec test <baseline> -- <command>'); const baseline=await readTrace(base); try{ await execa(c,args,{stdio:'inherit',env:{...process.env,AGENTREC_ENABLED:'1'}}); }catch(e){ console.log(`Command failed: ${e instanceof Error?e.message:String(e)}`); process.exitCode=2; return;} const latest=await readTrace(await latestTracePath()); const diff=diffTraces(baseline,latest); console.log(diff.equal?'Regression test passed.':diff.differences.join('\n')); process.exitCode=diff.equal?0:1; });
try { await program.parseAsync(process.argv); } catch(e) { console.error(e instanceof Error?e.message:String(e)); process.exitCode=2; }
