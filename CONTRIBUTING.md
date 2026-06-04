# Contributing to agentrec

Thanks for helping improve agentrec — a local-first black box recorder for AI agents.

## Development setup

```bash
npm ci
npm run typecheck
npm test
npm run build
node dist/cli/index.js --help
```

Node.js 20 or newer is required.

## Pull request expectations

Before opening a PR, run:

```bash
npm run typecheck
npm test
npm run build
```

If you change CLI behavior, also run a CLI smoke test and include the output in the PR body.

## Project conventions

- Keep the CLI backwards compatible unless the PR explicitly proposes a breaking change.
- Treat trace format changes as compatibility-sensitive.
- Add tests for new behavior.
- Keep examples runnable without paid credentials whenever possible.
- Do not commit real traces that contain secrets, tokens, customer data, prompts, or private code.

## Adding trace fixtures

Trace fixtures should be small, deterministic, and scrubbed of sensitive content.
Normalize timestamps, paths, random IDs, and machine-specific values before committing fixtures.

## Reporting security issues

Please do not open public issues for vulnerabilities or secret leakage concerns. See [SECURITY.md](./SECURITY.md).
