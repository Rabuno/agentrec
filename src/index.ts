export { createRecorder, AgentRecorder } from './core/recorder.js';
export type { RecorderOptions } from './core/recorder.js';
export type { AgentTrace, AgentEvent } from './core/types.js';
export { readTrace, saveTrace, latestTracePath } from './core/storage.js';
export { diffTraces } from './diff.js';
export { ReplayStore } from './replay.js';
export { renderTraceReport, writeTraceReport, defaultReportPath } from './report.js';
export type { ReportOptions } from './report.js';
