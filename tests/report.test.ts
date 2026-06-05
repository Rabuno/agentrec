import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';
import { TRACE_SCHEMA_VERSION, type AgentTrace } from '../src/core/types.js';
import { defaultReportPath, renderTraceReport, writeTraceReport } from '../src/report.js';

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const trace: AgentTrace = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  runId: 'run_report',
  status: 'completed',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:01.250Z',
  durationMs: 1250,
  input: { prompt: 'hello' },
  output: { answer: 'done' },
  metadata: { model: 'mock-model', unsafe: '<script>alert("x")</script>' },
  events: [
    { id: 'evt_1', type: 'run.started', timestamp: '2026-01-01T00:00:00.000Z', name: 'run', data: { input: 'hello' } },
    { id: 'evt_2', type: 'tool.call', timestamp: '2026-01-01T00:00:00.300Z', name: 'search', data: { query: '<bad>' } },
    { id: 'evt_3', type: 'llm.request', timestamp: '2026-01-01T00:00:00.600Z', name: 'llm', data: { model: 'mock-model' } },
    { id: 'evt_4', type: 'run.finished', timestamp: '2026-01-01T00:00:01.250Z', name: 'run', data: { output: 'done' } },
  ],
};

describe('trace reports', () => {
  it('renders escaped summary and timeline html', () => {
    const html = renderTraceReport(trace, '/tmp/run_report.json');

    expect(html).toContain('agentrec trace report');
    expect(html).toContain('run_report');
    expect(html).toContain('1.25s');
    expect(html).toContain('tool.call');
    expect(html).toContain('&lt;script&gt;alert(\\&quot;x\\&quot;)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert("x")</script>');
  });

  it('redacts reports written through the report writer', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentrec-report-redact-'));
    const tracePath = join(dir, 'secret.trace.json');

    try {
      const reportPath = await writeTraceReport(
        { ...trace, metadata: { ...trace.metadata, apiKey: 'super-secret-value' } },
        tracePath,
      );
      const html = await readFile(reportPath, 'utf8');

      expect(html).toContain('[REDACTED]');
      expect(html).not.toContain('super-secret-value');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('supports disabling report redaction from the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentrec-report-no-redact-'));
    const tracePath = join(dir, 'secret.trace.json');
    const reportPath = defaultReportPath(tracePath);

    try {
      await writeFile(tracePath, JSON.stringify({ ...trace, metadata: { ...trace.metadata, apiKey: 'super-secret-value' } }), 'utf8');
      await execa('node', ['--import', 'tsx', 'src/cli/index.ts', 'report', tracePath, '--no-redaction']);
      const html = await readFile(reportPath, 'utf8');

      expect(html).toContain('super-secret-value');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);

  it('writes the default report next to the trace from the CLI', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'agentrec-report-'));
    const tracePath = join(dir, 'sample.trace.json');
    await writeFile(tracePath, JSON.stringify(trace), 'utf8');

    try {
      const stdoutPath = join(dir, 'stdout.txt');
      await execa('bash', ['-lc', `node --import tsx src/cli/index.ts report ${quote(tracePath)} > ${quote(stdoutPath)}`]);
      const reportPath = defaultReportPath(tracePath);
      const stdout = await readFile(stdoutPath, 'utf8');
      const html = await readFile(reportPath, 'utf8');

      expect(stdout).toContain(`Report written to ${reportPath}`);
      expect(html).toContain('Events Timeline');
      expect(html).toContain('sample.trace.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);
});
