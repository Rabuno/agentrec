# Launch Copy

## Hacker News

Show HN: agentrec — a black box recorder for AI agents

AI agents fail in ways that are hard to reproduce: prompts drift, tool outputs change, model responses vary, and regressions are invisible until production.

`agentrec` records every agent run as a local JSON trace, then lets you inspect the timeline, replay recorded outputs, and regression-test new runs against a baseline in CI.

No SaaS, no account, no dashboard required. TypeScript SDK + CLI, works in under 5 minutes.

## X / Twitter

We are building `agentrec`: an open-source black box recorder for AI agents.

It captures prompts, tool calls, model responses, errors, latency, and final outputs as replayable local traces.

Use it to debug failures and catch agent regressions in CI before they hit production.

## Reddit

I built a local-first flight recorder for AI agents: trace every run, inspect the timeline, replay recorded tool/LLM outputs, and diff against a baseline.

It is not an agent framework or SaaS dashboard — just a TypeScript SDK + CLI for debugging agent behavior.

## LinkedIn

AI agent reliability needs boring infrastructure: traceability, replay, regression tests, and CI gates. `agentrec` is an open-source attempt to make that workflow local-first and developer-friendly.
