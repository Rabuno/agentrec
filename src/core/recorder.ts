import { randomUUID } from 'node:crypto';
import { saveTrace } from './storage.js';
import { TRACE_SCHEMA_VERSION, type AgentEvent, type AgentEventType, type AgentTrace } from './types.js';
const now=()=>new Date().toISOString();
const dur=(a:string,b:string)=>Math.max(0,new Date(b).getTime()-new Date(a).getTime());
export type RecorderOptions={ runDir?:string; metadata?:Record<string,unknown>; autoSave?:boolean };
export class AgentRecorder{ private trace:AgentTrace|null=null; constructor(private options:RecorderOptions={}){}
 startRun(input?:unknown, metadata?:Record<string,unknown>){ const startedAt=now(); this.trace={schemaVersion:TRACE_SCHEMA_VERSION,runId:`run_${randomUUID()}`,status:'running',startedAt,input,metadata:{...this.options.metadata,...metadata},events:[]}; this.recordEvent('run.started','run',{input}); return this.currentTrace(); }
 recordEvent(type:AgentEventType,name?:string,data?:Record<string,unknown>):AgentEvent{ if(!this.trace) throw new Error('No active run. Call startRun() first.'); const event={id:`evt_${randomUUID()}`,type,timestamp:now(),name,data}; this.trace.events.push(event); return event; }
 recordAgentStep(name:string,data?:Record<string,unknown>){ return this.recordEvent('agent.step',name,data); } recordLlmRequest(data:Record<string,unknown>){ return this.recordEvent('llm.request','llm',data); } recordLlmResponse(data:Record<string,unknown>){ return this.recordEvent('llm.response','llm',data); } recordToolCall(name:string,data?:Record<string,unknown>){ return this.recordEvent('tool.call',name,data); } recordToolResult(name:string,data?:Record<string,unknown>){ return this.recordEvent('tool.result',name,data); }
 async finishRun(output?:unknown){ const t=this.currentTrace(); const end=now(); t.status='completed'; t.finishedAt=end; t.output=output; t.durationMs=dur(t.startedAt,end); this.recordEvent('run.finished','run',{output}); if(this.options.autoSave??true) await saveTrace(t,this.options.runDir); return t; }
 async failRun(error:unknown){ const t=this.currentTrace(); const end=now(); t.status='failed'; t.finishedAt=end; t.durationMs=dur(t.startedAt,end); this.recordEvent('error','error',{message:error instanceof Error?error.message:String(error)}); if(this.options.autoSave??true) await saveTrace(t,this.options.runDir); return t; }
 currentTrace(){ if(!this.trace) throw new Error('No active run. Call startRun() first.'); return this.trace; }}
export function createRecorder(options?:RecorderOptions){ return new AgentRecorder(options); }
