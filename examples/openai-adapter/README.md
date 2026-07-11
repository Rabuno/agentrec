# OpenAI SDK adapter example

This example shows transparent recording: wrap a real `OpenAI` client once with
`wrapOpenAI` and every `chat.completions.create()` call is recorded automatically —
no per-call `recorder.recordLlmRequest()`/`recordLlmResponse()` calls.

It stubs the client's `fetch` option so it runs with no API key and no network access:

```bash
tsx examples/openai-adapter/agent.ts
npx agentrec show $(npx agentrec latest)
```

To use a real API key, construct `new OpenAI()` without the `fetch` override — the
`wrapOpenAI` call is unchanged.

`wrapOpenAI` mutates the client you pass in and returns it (not a copy) — reassigns
`chat.completions.create` in place, so other resources on the client (`embeddings`,
`models`, ...) and helpers built on `create` (`.parse()`, `.stream()`, `runTools()`)
keep working. Tool *results* are reconstructed from the next request's `messages`
array, so a run that ends mid-tool-call (no further request) won't have its last
tool result recorded. Calling `stream.tee()` on a streamed response bypasses
recording for the teed branch.
