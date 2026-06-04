# agentrec

[![npm version](https://img.shields.io/npm/v/agentrec?style=flat-square)](https://www.npmjs.com/package/agentrec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Rabuno/agentrec/ci.yml?style=flat-square)](https://github.com/Rabuno/agentrec/actions)

> Ship AI agents with a black box recorder: local traces, replayable outputs, HTML reports, and CI regression checks.

`agentrec` is a local-first CLI and TypeScript SDK for recording AI agent runs. It captures prompts, tool calls, model responses, errors, timings, metadata, and final outputs as portable JSON traces you can inspect, replay, diff, and share as self-contained HTML.

No SaaS. No account. No vendor lock-in. Traces stay on disk in your repo or CI artifacts.

## Why agentrec?

Production AI agents are opaque. When an agent breaks in production, you need more than logs — you need the full flight recording. agentrec captures every step of an agent run so you can:

| Problem | How agentrec helps |
|---|---|
| "The agent gave a wrong answer yesterday but works now." | **Diff** two traces to pinpoint exactly what changed. |
| "A tool call returned garbage and poisoned the context." | **Replay** recorded outputs to isolate the failure. |
| "The regression suite doesn't cover agent behavior." | Record baselines, then **test** new runs against them in CI. |
| "I need to explain this agent run to my team." | Generate a self-contained **HTML report** and share the file. |

## Key Features

- **Record** — Capture prompts, tool calls, LLM responses, timings, and metadata as portable JSON traces.
- **Replay** — Replay recorded outputs for deterministic testing and debugging.
- **Diff** — Compare two traces to detect output and tool-call regressions.
- **Report** — Generate self-contained HTML reports you can share or archive.
- **CLI & SDK** — Use the CLI for quick inspection, or the TypeScript SDK for programmatic recording.
- **CI-ready** — `agentrec test` compares new traces to baselines with exit-code signaling.

## Quickstart

### Try it in one command

```bash
npx agentrec init
npx agentrec record -- npx tsx -e "
  const {createRecorder} = require('agentrec');
  const r = createRecorder();
  r.startRun({q: 'hello'});
  r.recordToolCall('lookup', {key: 'greeting'});
  r.recordToolResult('lookup', {value: 'world'});
  r.finishRun({answer: 'world'});
"
TRACE=$(ls -t .agentrec/runs/*.json | head -1)
npx agentrec show "$TRACE"
```

### SDK usage

```ts
import { createRecorder } from 'agentrec';

const recorder = createRecorder({ metadata: { agent: 'support-bot', v: '1.2.0' } });
recorder.startRun({ question: 'How do I debug an agent?' });

recorder.recordToolCall('search', { query: 'agent debugging' });
recorder.recordToolResult('search', { snippet: 'Record, replay, test.' });

recorder.recordLlmRequest({ model: 'gpt-4.1', prompt: '...' });
recorder.recordLlmResponse({ text: 'Use a flight recorder.' });

await recorder.finishRun({ answer: 'Use a flight recorder.' });
```

### CLI commands

| Command | Description |
|---|---|
| `agentrec init` | Create `.agentrec/` folders and config. |
| `agentrec record -- <cmd>` | Run a command with agentrec env vars. |
| `agentrec show <trace>` | Render a trace timeline to stdout. |
| `agentrec report <trace>` | Generate a self-contained HTML report. |
| `agentrec list` | List recent traces with status and timings. |
| `agentrec replay <trace>` | Print recorded replay outputs. |
| `agentrec diff <a> <b>` | Detect output/tool-call regressions. |
| `agentrec test <baseline> -- <cmd>` | Run and compare latest trace to baseline. |

## Quick demo: record → show → report → diff

```bash
npm ci && npm run build
npm run example

TRACE=$(ls -t .agentrec/runs/*.json | head -1)
npx agentrec list
npx agentrec show "$TRACE"
npx agentrec report "$TRACE" --output /tmp/agentrec-demo.html
npx agentrec diff "$TRACE" "$TRACE"   # should print "No regression detected"
```

Open `/tmp/agentrec-demo.html` in your browser to see the full trace report.

## Examples

- **[Basic agent](examples/basic-agent/agent.ts)** — Search + LLM pattern with a fake provider (no API key needed).
- **[OpenAI wrapper](examples/openai-wrapper/agent.ts)** — Wrap an OpenAI-style call with tracing (dry-run by default).
- **[Multi-step agent](examples/multi-step-agent/agent.ts)** — A realistic multi-step agent with planning, tool calls, and structured output.

## Trace format

Traces are portable JSON files validated by a Zod schema. The schema version is `agentrec.trace.v1` and the format is designed to be:

- **Stable** — backward-compatible across minor versions.
- **Inspectable** — open in any text editor or JSON viewer.
- **CI-friendly** — store baselines in git, compare in CI pipelines.

## Non-goals

Not an agent framework, not a SaaS dashboard, and not a full observability platform. `agentrec` is intentionally boring infrastructure for local traces and regression checks.

## Roadmap

Vercel AI SDK wrapper, LangChain adapter, redaction policies, GitHub Action, OpenTelemetry export, Python SDK.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and PR guidelines.

## License

MIT
