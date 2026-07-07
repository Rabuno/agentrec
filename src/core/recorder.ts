import { randomUUID } from 'node:crypto';
import { redactTrace, type RedactionOptions } from './redaction.js';
import { saveTrace } from './storage.js';
import { TRACE_SCHEMA_VERSION, type AgentEvent, type AgentEventType, type AgentTrace } from './types.js';

const now = () => new Date().toISOString();
const durationMs = (startedAt: string, finishedAt: string) =>
  Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime());

export type RecorderOptions = {
  runDir?: string;
  metadata?: Record<string, unknown>;
  autoSave?: boolean;
  redaction?: RedactionOptions | false;
};

export class AgentRecorder {
  private trace: AgentTrace | null = null;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private lastWriteError: unknown = null;

  constructor(private options: RecorderOptions = {}) {}

  startRun(input?: unknown, metadata?: Record<string, unknown>) {
    const startedAt = now();

    this.trace = {
      schemaVersion: TRACE_SCHEMA_VERSION,
      runId: `run_${randomUUID()}`,
      status: 'running',
      startedAt,
      input,
      metadata: { ...this.options.metadata, ...metadata },
      events: [],
    };

    this.recordEvent('run.started', 'run', { input });
    return this.currentTrace();
  }

  recordEvent(type: AgentEventType, name?: string, data?: Record<string, unknown>): AgentEvent {
    this.throwIfWriteFailed();
    const trace = this.currentTrace();
    if (trace.status !== 'running') {
      throw new Error(`Cannot record ${type} event after run is ${trace.status}.`);
    }

    const event = {
      id: `evt_${randomUUID()}`,
      type,
      timestamp: now(),
      name,
      data,
    };

    trace.events.push(event);
    this.scheduleIncrementalWrite();
    return event;
  }

  recordAgentStep(name: string, data?: Record<string, unknown>) {
    return this.recordEvent('agent.step', name, data);
  }

  recordLlmRequest(data: Record<string, unknown>) {
    return this.recordEvent('llm.request', 'llm', data);
  }

  recordLlmResponse(data: Record<string, unknown>) {
    return this.recordEvent('llm.response', 'llm', data);
  }

  recordToolCall(name: string, data?: Record<string, unknown>) {
    return this.recordEvent('tool.call', name, data);
  }

  recordToolResult(name: string, data?: Record<string, unknown>) {
    return this.recordEvent('tool.result', name, data);
  }

  async finishRun(output?: unknown) {
    const trace = this.currentTrace();
    this.assertRunning('finish');

    const finishedAt = now();
    trace.events.push(this.createTerminalEvent('run.finished', 'run', { output }));
    trace.status = 'completed';
    trace.finishedAt = finishedAt;
    trace.output = output;
    trace.durationMs = durationMs(trace.startedAt, finishedAt);

    const result = await this.persistIfNeeded(trace);
    this.throwIfWriteFailed();
    return result;
  }

  async failRun(error: unknown) {
    const trace = this.currentTrace();
    this.assertRunning('fail');

    const finishedAt = now();
    trace.events.push(
      this.createTerminalEvent('error', 'error', {
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    trace.status = 'failed';
    trace.finishedAt = finishedAt;
    trace.durationMs = durationMs(trace.startedAt, finishedAt);

    const result = await this.persistIfNeeded(trace);
    this.throwIfWriteFailed();
    return result;
  }

  currentTrace() {
    if (!this.trace) throw new Error('No active run. Call startRun() first.');
    return this.trace;
  }

  private createTerminalEvent(type: AgentEventType, name: string, data?: Record<string, unknown>): AgentEvent {
    return {
      id: `evt_${randomUUID()}`,
      type,
      timestamp: now(),
      name,
      data,
    };
  }

  private assertRunning(action: 'finish' | 'fail') {
    const trace = this.currentTrace();
    if (trace.status !== 'running') {
      throw new Error(`Cannot ${action} run ${trace.runId}; it is already ${trace.status}.`);
    }
  }

  private async persistIfNeeded(trace: AgentTrace) {
    const finalTrace = this.applyRedaction(trace);
    this.trace = finalTrace;

    if (this.options.autoSave ?? true) {
      this.writeQueue = this.writeQueue.then(() => saveTrace(finalTrace, this.options.runDir));
      await this.writeQueue;
    }

    return finalTrace;
  }

  /** Fire-and-forget: keeps the trace file live so a crash mid-run doesn't lose it. Failures surface on the next call. */
  private scheduleIncrementalWrite() {
    if (!(this.options.autoSave ?? true)) return;

    this.writeQueue = this.writeQueue.then(() => this.writeCurrentSnapshot()).catch((error) => {
      this.lastWriteError = error;
    });
  }

  private async writeCurrentSnapshot() {
    const trace = this.trace;
    if (!trace) return;
    await saveTrace(this.applyRedaction(trace), this.options.runDir);
  }

  private applyRedaction(trace: AgentTrace): AgentTrace {
    return this.options.redaction === false ? trace : redactTrace(trace, this.options.redaction);
  }

  private throwIfWriteFailed() {
    if (this.lastWriteError !== null) {
      const error = this.lastWriteError;
      this.lastWriteError = null;
      throw error;
    }
  }
}

export function createRecorder(options?: RecorderOptions) {
  return new AgentRecorder(options);
}
