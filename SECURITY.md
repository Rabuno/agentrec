# Security Policy

agentrec records AI agent traces locally. Those traces can contain sensitive data: prompts, tool inputs, file paths, terminal output, API responses, and occasionally secrets.

## Supported versions

| Version | Supported |
| --- | --- |
| 0.x | Best-effort security fixes |

## Reporting a vulnerability

Please report security issues privately to the maintainer instead of opening a public GitHub issue.

Include:

- agentrec version
- Node.js version
- operating system
- minimal reproduction steps
- impact and affected data if known

## Handling sensitive traces

- Do not commit real production traces.
- Redact tokens, credentials, private prompts, customer data, and proprietary source code before sharing traces.
- Prefer minimal synthetic traces for bug reports.
- If a trace is needed for debugging, share the smallest possible redacted sample.

## Security goals

agentrec is local-first: trace files stay on your machine unless you explicitly upload or share them. The project should not introduce telemetry, SaaS dependencies, or hidden network calls for core tracing workflows.
