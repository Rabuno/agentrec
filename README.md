# agentrec

> Black box recorder for AI agents. Trace, replay, and regression-test every agent run before production.

`agentrec` is a local-first flight recorder for AI agents. It captures prompts, tool calls, model responses, errors, and outputs as replayable JSON traces so you can debug failures and catch regressions in CI.

## Quickstart

```bash
npm install
npm run build
node dist/cli/index.js init
npm run example
TRACE=$(ls .agentrec/runs/*.json | tail -1)
node dist/cli/index.js show "$TRACE"
node dist/cli/index.js replay "$TRACE"
node dist/cli/index.js diff "$TRACE" "$TRACE"
```

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
- `agentrec replay <trace>` — print recorded replay outputs.
- `agentrec diff <baseline> <latest>` — detect output/tool-call regressions.
- `agentrec record -- <command>` — run a command with agentrec env vars.
- `agentrec test <baseline> -- <command>` — run and compare latest trace to baseline.

## Non-goals

Not an agent framework, not a SaaS dashboard, and not a full observability platform.

## Roadmap

OpenAI/Vercel AI wrappers, LangChain adapter, static HTML reports, redaction policies, GitHub Action, OpenTelemetry export, Python SDK.

## License

MIT
