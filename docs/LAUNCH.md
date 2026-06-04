# Launch Copy

## Hacker News

Show HN: agentrec — a local-first black box recorder for AI agents

AI agents fail in ways that are hard to reproduce: prompts drift, tool outputs change, model responses vary, and regressions are invisible until production.

`agentrec` records every agent run as a local JSON trace, then lets you inspect the timeline, generate a self-contained HTML report, replay recorded outputs, and regression-test new runs against a baseline in CI.

No SaaS, no account, no dashboard required. TypeScript SDK + CLI, works in about 10 seconds once installed.

Demo:

```bash
npm run build
npm run example
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js report "$TRACE"
```

## X / Twitter

We are building `agentrec`: an open-source black box recorder for AI agents.

It captures prompts, tool calls, model responses, errors, latency, and final outputs as replayable local traces and self-contained HTML reports.

Use it to debug failures and catch agent regressions in CI before they hit production.

Local-first. No SaaS. No vendor lock-in.

## Reddit

I built a local-first flight recorder for AI agents: trace every run, inspect the timeline, generate an HTML report, replay recorded tool/LLM outputs, and diff against a baseline.

It is not an agent framework or SaaS dashboard — just a TypeScript SDK + CLI for debugging agent behavior.

The current demo runs without API keys, so you can try the workflow before wiring it into your own OpenAI/Vercel/LangChain code.

## LinkedIn

AI agent reliability needs boring infrastructure: traceability, HTML reports, replay, regression tests, and CI gates. `agentrec` is an open-source attempt to make that workflow local-first and developer-friendly.
