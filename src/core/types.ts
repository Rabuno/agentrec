export const TRACE_SCHEMA_VERSION = 'agentrec.trace.v1' as const;

export type AgentEventType =
  | 'run.started'
  | 'run.finished'
  | 'agent.step'
  | 'llm.request'
  | 'llm.response'
  | 'tool.call'
  | 'tool.result'
  | 'error';

export type AgentEvent = {
  id: string;
  type: AgentEventType;
  timestamp: string;
  name?: string;
  data?: Record<string, unknown>;
};

export type AgentTraceStatus = 'running' | 'completed' | 'failed';

export type AgentTrace = {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  runId: string;
  status: AgentTraceStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  events: AgentEvent[];
};
