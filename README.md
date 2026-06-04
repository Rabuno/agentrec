# agentrec

> Ship AI agents with a black box recorder: local traces, replayable outputs, HTML reports, and CI regression checks.

`agentrec` is a local-first CLI and TypeScript SDK for recording AI agent runs. It captures prompts, tool calls, model responses, errors, timings, metadata, and final outputs as portable JSON traces you can inspect, replay, diff, and share as self-contained HTML.

No SaaS. No account. No vendor lock-in. Traces stay on disk in your repo or CI artifacts.

## Quickstart

```bash
npm install
npm run build
node dist/cli/index.js init
npm run example
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js show "$TRACE"
node dist/cli/index.js report "$TRACE"
node dist/cli/index.js replay "$TRACE"
node dist/cli/index.js diff "$TRACE" "$TRACE"
```

The report command writes `<trace-file-basename>.html` next to the trace by default. Use `--output report.html` to choose a path.

## Minimal SDK usage

```ts
import { createRecorder } from 'agentrec';
const recorder = createRecorder();
recorder.startRun({ question: 'How do I debug an agent?' });
recorder.recordToolCall('search', { query: 'agent debugging' });
recorder.recordToolResult('search', { snippet: 'Record, replay, test.' });
recorder.recordLlmRequest({ model: 'gpt-4.1', prompt: '...' });
recorder.recordLlmResponse({ text: 'Use a flight recorder.' });
await recorder.finishRun({ answer: 'Use a flight recorder.' });
```

## CLI

- `agentrec init` — create `.agentrec/` folders.
- `agentrec show <trace>` — render a trace timeline.
- `agentrec report <trace> [--output file]` — generate a self-contained HTML report.
- `agentrec replay <trace>` — print recorded replay outputs.
- `agentrec diff <baseline> <latest>` — detect output/tool-call regressions.
- `agentrec record -- <command>` — run a command with agentrec env vars.
- `agentrec test <baseline> -- <command>` — run and compare latest trace to baseline.

## Launch-ready demo flow

```bash
npm ci
npm run build
node dist/cli/index.js init
npx tsx examples/openai-wrapper/agent.ts
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js show "$TRACE"
node dist/cli/index.js report "$TRACE" --output /tmp/agentrec-demo.html
node dist/cli/index.js diff "$TRACE" "$TRACE"
```

Open `/tmp/agentrec-demo.html` to review the run summary, metadata, timings, and event timeline. The OpenAI-style example is dry-run by default and does not require paid credentials.

## Non-goals

Not an agent framework, not a SaaS dashboard, and not a full observability platform. `agentrec` is intentionally boring infrastructure for local traces and regression checks.

## Roadmap

Vercel AI SDK wrapper, LangChain adapter, redaction policies, GitHub Action, OpenTelemetry export, Python SDK.

## License

MIT
