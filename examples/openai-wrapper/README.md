# OpenAI-style wrapper example

This example shows how to wrap an OpenAI-style chat call with `agentrec` without requiring a real API key.

By default it runs in dry-run mode and records a mock request/response trace:

```bash
tsx examples/openai-wrapper/agent.ts
TRACE=$(ls .agentrec/runs/*.json | tail -1)
tsx src/cli/index.ts report "$TRACE"
```

To adapt this for a real OpenAI client, replace `mockChatCompletion` with your SDK call and keep the recorder calls around the request and response. Do not record secrets; store only the model name, messages, tool names, response IDs, timings, and redacted content your team is comfortable saving locally.
