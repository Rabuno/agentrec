export { createRecorder, AgentRecorder } from './core/recorder.js';
export type { RecorderOptions } from './core/recorder.js';
export { redactTrace, redactValue, DEFAULT_REDACTION_RULES, DEFAULT_REDACTION_REPLACEMENT } from './core/redaction.js';
export type { RedactionOptions, RedactionRule } from './core/redaction.js';
export type { AgentTrace, AgentEvent } from './core/types.js';
export { readTrace, saveTrace, latestTracePath } from './core/storage.js';
export { diffTraces } from './diff.js';
export type { DiffOptions, TraceDiff } from './diff.js';
export { ReplayStore } from './replay.js';
export { renderTraceReport, writeTraceReport, defaultReportPath } from './report.js';
export type { ReportOptions } from './report.js';
export { createMcpInterceptor } from './core/mcp.js';

