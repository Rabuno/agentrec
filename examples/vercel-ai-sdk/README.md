# Vercel AI SDK adapter example

This example shows transparent recording: wrap a model once with `agentrecMiddleware`
and every `generateText`/`streamText` call is recorded automatically — no per-step
`recorder.recordLlmRequest()`/`recordToolCall()` calls.

It uses `MockLanguageModelV4` from `ai/test` so it runs with no API key:

```bash
tsx examples/vercel-ai-sdk/agent.ts
npx agentrec show $(npx agentrec latest)
```

To use a real provider, replace `mockModel` with a real model (e.g. `openai('gpt-4o')`
from `@ai-sdk/openai`) — the `wrapLanguageModel`/`agentrecMiddleware` call is unchanged.

Requires `ai@^7.0.0` as a peer dependency. The middleware records LLM requests/responses
and tool calls; tool *results* are reconstructed from the next step's prompt, so a run
that ends mid-tool-call (no further step) won't have its last tool result recorded.
