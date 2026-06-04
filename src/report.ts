import { basename, dirname, join, parse } from 'node:path';
import { writeFile } from 'node:fs/promises';
import type { AgentEvent, AgentTrace } from './core/types.js';

export type ReportOptions = {
  output?: string;
};

export function defaultReportPath(tracePath: string) {
  const parsed = parse(tracePath);
  return join(dirname(tracePath), `${parsed.name}.html`);
}

export async function writeTraceReport(trace: AgentTrace, tracePath: string, options: ReportOptions = {}) {
  const outputPath = options.output ?? defaultReportPath(tracePath);
  await writeFile(outputPath, renderTraceReport(trace, tracePath), 'utf8');
  return outputPath;
}

export function renderTraceReport(trace: AgentTrace, tracePath = 'trace.json') {
  const counts = countEvents(trace.events);
  const statusClass = `status-${trace.status}`;
  const duration = formatDuration(trace.durationMs ?? elapsedMs(trace.startedAt, trace.finishedAt));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentrec report - ${escapeHtml(trace.runId)}</title>
<style>
:root{color-scheme:light dark;--bg:#f7f8fb;--panel:#fff;--text:#172033;--muted:#647084;--border:#d9dee8;--accent:#0f766e;--warn:#b45309;--bad:#b42318;--code:#111827}
@media (prefers-color-scheme:dark){:root{--bg:#111318;--panel:#181c24;--text:#eef2f7;--muted:#a6b0c0;--border:#343b49;--accent:#2dd4bf;--warn:#f59e0b;--bad:#f87171;--code:#f8fafc}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:32px 20px 48px}header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
h1{font-size:30px;line-height:1.1;margin:0 0 8px}h2{font-size:18px;margin:0 0 14px}.muted{color:var(--muted)}.trace-path{word-break:break-all}
.badge{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:999px;padding:4px 10px;font-weight:700}.status-completed{color:var(--accent)}.status-running{color:var(--warn)}.status-failed{color:var(--bad)}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 24px}.panel,.metric{background:var(--panel);border:1px solid var(--border);border-radius:8px}
.metric{padding:14px}.metric strong{display:block;font-size:22px}.metric span{color:var(--muted)}
.panel{padding:18px;margin-bottom:16px}.kv{display:grid;grid-template-columns:160px minmax(0,1fr);gap:8px 14px}.kv div:nth-child(odd){color:var(--muted)}
pre{margin:0;white-space:pre-wrap;word-break:break-word;color:var(--code);font:13px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.timeline{display:grid;gap:10px}.event{display:grid;grid-template-columns:190px 140px minmax(0,1fr);gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--panel)}
.event-type{font-weight:700}.event-name{color:var(--muted)}.event-time{color:var(--muted);font-variant-numeric:tabular-nums}
@media (max-width:760px){header{display:block}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.kv{grid-template-columns:1fr}.event{grid-template-columns:1fr;gap:4px}main{padding:24px 14px}}
</style>
</head>
<body>
<main>
<header>
  <div>
    <h1>agentrec trace report</h1>
    <div class="muted trace-path">${escapeHtml(basename(tracePath))}</div>
  </div>
  <div class="badge ${statusClass}">${escapeHtml(trace.status)}</div>
</header>

<section class="grid" aria-label="Trace summary">
  <div class="metric"><strong>${escapeHtml(trace.events.length.toString())}</strong><span>events</span></div>
  <div class="metric"><strong>${escapeHtml(duration)}</strong><span>duration</span></div>
  <div class="metric"><strong>${escapeHtml(counts['llm.request'] ?? 0)}</strong><span>LLM requests</span></div>
  <div class="metric"><strong>${escapeHtml(counts['tool.call'] ?? 0)}</strong><span>tool calls</span></div>
</section>

<section class="panel">
  <h2>Summary</h2>
  <div class="kv">
    <div>Run ID</div><div>${escapeHtml(trace.runId)}</div>
    <div>Schema</div><div>${escapeHtml(trace.schemaVersion)}</div>
    <div>Started</div><div>${escapeHtml(formatDate(trace.startedAt))}</div>
    <div>Finished</div><div>${escapeHtml(trace.finishedAt ? formatDate(trace.finishedAt) : 'not finished')}</div>
    <div>Duration</div><div>${escapeHtml(duration)}</div>
  </div>
</section>

${trace.metadata ? jsonPanel('Metadata', trace.metadata) : ''}
${trace.input !== undefined ? jsonPanel('Input', trace.input) : ''}
${trace.output !== undefined ? jsonPanel('Output', trace.output) : ''}

<section class="panel">
  <h2>Events Timeline</h2>
  <div class="timeline">
    ${trace.events.map(renderEvent).join('\n')}
  </div>
</section>
</main>
</body>
</html>`;
}

function renderEvent(event: AgentEvent) {
  return `<article class="event">
  <div class="event-time">${escapeHtml(formatDate(event.timestamp))}</div>
  <div>
    <div class="event-type">${escapeHtml(event.type)}</div>
    ${event.name ? `<div class="event-name">${escapeHtml(event.name)}</div>` : ''}
  </div>
  <pre>${escapeHtml(event.data === undefined ? '' : stringify(event.data))}</pre>
</article>`;
}

function jsonPanel(title: string, value: unknown) {
  return `<section class="panel">
  <h2>${escapeHtml(title)}</h2>
  <pre>${escapeHtml(stringify(value))}</pre>
</section>`;
}

function countEvents(events: AgentEvent[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
}

function elapsedMs(startedAt: string, finishedAt?: string) {
  if (!finishedAt) return undefined;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) ? Math.max(0, ms) : undefined;
}

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return 'n/a';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function stringify(value: unknown) {
  return JSON.stringify(value, null, 2) ?? String(value);
}

function escapeHtml(value: string | number) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
