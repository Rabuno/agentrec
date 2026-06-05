import { describe, expect, it } from 'vitest';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';
import { diffTraces } from '../src/diff.js';
import { ReplayStore } from '../src/replay.js';

const timestamp = new Date().toISOString();

const trace: AgentTrace = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: 'run_1',
  status: 'completed',
  startedAt: timestamp,
  output: { answer: 'a' },
  events: [
    { id: 'e1', type: 'tool.result', name: 'search', timestamp, data: { result: 'ok' } },
    { id: 'e2', type: 'llm.response', name: 'llm', timestamp, data: { text: 'answer' } },
  ],
};

describe('diff/replay', () => {
  it('detects output changes', () => {
    expect(diffTraces(trace, { ...trace, output: { answer: 'b' } }).differences).toContain('final output changed');
  });

  it('uses stable object ordering and ignores volatile trace fields by default', () => {
    const left = { ...trace, output: { a: 1, b: 2 } };
    const right = {
      ...trace,
      runId: 'run_2',
      startedAt: new Date(Date.now() + 1000).toISOString(),
      output: { b: 2, a: 1 },
      events: trace.events.map((event, index) => ({ ...event, id: `changed_${index}`, timestamp: new Date().toISOString() })),
    };

    expect(diffTraces(left, right).equal).toBe(true);
  });

  it('reports nested event data changes with useful paths', () => {
    const changed = {
      ...trace,
      events: [{ ...trace.events[0], data: { result: 'changed' } }, trace.events[1]],
    };

    expect(diffTraces(trace, changed).differences).toContain('events.0.data.result changed: "ok" -> "changed"');
  });

  it('respects diff options for ignored paths and event data comparison', () => {
    const changed = {
      ...trace,
      metadata: { requestId: 'changed' },
      events: [{ ...trace.events[0], data: { result: 'changed' } }, trace.events[1]],
    };

    expect(diffTraces(trace, changed, { compareEventData: false, ignorePaths: ['metadata.requestId'] }).equal).toBe(true);
  });

  it('replays recorded outputs with backwards-compatible helpers', () => {
    const store = new ReplayStore(trace);
    expect(store.nextToolResult('search')).toEqual({ result: 'ok' });
    expect(store.nextLlmResponse()).toEqual({ text: 'answer' });
  });

  it('can replay result events in original event order', () => {
    const store = new ReplayStore(trace);
    expect(store.nextEvent('tool.result', 'search').data).toEqual({ result: 'ok' });
    expect(store.nextEvent('llm.response', 'llm').data).toEqual({ text: 'answer' });
    expect(() => store.nextEvent()).toThrow('Replay exhausted');
  });

  it('throws clear replay mismatch errors for expected event type or name', () => {
    const store = new ReplayStore(trace);

    expect(() => store.nextEvent('llm.response')).toThrow('expected llm.response, got tool.result');
    expect(() => store.nextEvent('tool.result', 'wrong-tool')).toThrow('expected wrong-tool, got search');
  });
});
