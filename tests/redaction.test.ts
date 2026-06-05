import { describe, expect, it } from 'vitest';
import { redactTrace, redactValue } from '../src/core/redaction.js';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';

const trace: AgentTrace = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: 'run_redaction',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00.000Z',
  metadata: { apiKey: 'secret-key', nested: { safe: 'ok' } },
  output: { message: 'Bearer secretsecretsecretsecret' },
  events: [
    {
      id: 'evt_1',
      type: 'tool.result',
      timestamp: '2026-01-01T00:00:00.000Z',
      name: 'http',
      data: { headers: { authorization: 'Bearer secretsecretsecretsecret' } },
    },
  ],
};

describe('redaction', () => {
  it('redacts common secret keys and token-like strings by default', () => {
    const redacted = redactTrace(trace);

    expect(redacted.metadata?.apiKey).toBe('[REDACTED]');
    expect(redacted.output).toEqual({ message: '[REDACTED]' });
    expect(redacted.events[0].data?.headers).toEqual({ authorization: '[REDACTED]' });
  });

  it('supports custom path rules with wildcard segments', () => {
    const value = redactValue(
      { events: [{ data: { customerEmail: 'boss@example.com' } }] },
      { rules: [{ path: 'events.*.data.customerEmail' }] },
    );

    expect(value).toEqual({ events: [{ data: { customerEmail: '[REDACTED]' } }] });
  });

  it('can disable default rules while keeping custom rules', () => {
    const value = redactValue(
      { apiKey: 'kept', customSecret: 'removed' },
      { includeDefaults: false, rules: [{ key: 'customSecret' }] },
    );

    expect(value).toEqual({ apiKey: 'kept', customSecret: '[REDACTED]' });
  });
});
