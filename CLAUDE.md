# agentrec — Claude Project Context

## Product Positioning

`agentrec` is a local-first black box recorder and regression testing layer for AI agents.

Primary positioning:

> Playwright for AI Agents.

Secondary positioning:

> Record golden traces, replay failures, diff behavior, and catch AI-agent regressions in CI.

Do not describe the project as only a logger. The goal is to make agent behavior debuggable, reviewable, replayable, and testable with simple local files.

## Current Stack

- TypeScript / Node.js ESM package
- CLI + SDK
- Built with `tsup`
- Tests with Vitest
- Runtime dependencies include Commander, Zod, Picocolors, Execa
- Trace artifacts are JSON files under `.agentrec/`

## Quality Gates

Before considering work complete, run:

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

If a change touches CLI behavior, also add or update CLI tests.
If a change touches trace/diff/replay/redaction behavior, add focused tests.
If a change touches user-facing behavior, update README or examples.

## Git Workflow

- Do not push directly to `main` unless Rabuno explicitly asks for direct push.
- For autonomous daily improvement work, create a feature branch and PR into `main`.
- Use conventional commits.
- Do not merge PRs automatically.
- Never commit secrets, API keys, tokens, or generated private traces.

## Product Roadmap Priority

Optimize for 10k-star potential by prioritizing developer-visible leverage:

1. Golden trace baselines
2. `agentrec latest`
3. `agentrec baseline create/update/list`
4. `agentrec test` YAML config
5. Better local trace viewer / report UI
6. `agentrec diff --json`
7. OpenAI adapter
8. Vercel AI SDK adapter
9. GitHub Action
10. PR comment reporter
11. More examples with mock mode
12. README screenshots/GIF/docs polish

Scope weighting target:

- 40% user-facing features
- 25% adapters/examples
- 20% docs/README/demo polish
- 15% internal quality/testing

## Daily PR Value Threshold

Only create a PR if it contains at least one meaningful improvement:

- New command or CLI workflow
- New integration or example
- Visible README/report/docs/demo improvement
- Meaningful test/CI improvement
- Bug/security fix with tests

Avoid PRs that only rename things, churn formatting, or make tiny wording edits without strategic value.

## Design Principles

- Local-first: no account, no hosted service, no telemetry by default.
- Git-friendly: traces and baselines should be reviewable files.
- CI-first: workflows should work in GitHub Actions and other CI systems.
- Privacy-first: redact secrets by default and avoid leaking production data.
- Deterministic by default: exact structural checks before optional semantic/LLM checks.
- Zero-config where possible: make the first successful run easy.

## Competitive Framing

Compared to LangSmith, Langfuse, Braintrust, or hosted observability platforms:

- Those tools are hosted observability/evaluation platforms.
- `agentrec` is a local-first recorder + regression test runner.
- No dashboard required; traces are just files.

## Implementation Guidelines

- Keep APIs small and composable.
- Preserve backward compatibility unless there is a clear security/correctness reason.
- Prefer focused modules over large CLI monoliths.
- Add tests near behavior changes.
- Keep generated reports self-contained.
- Use stable output for diff/test commands so CI logs are readable.
- Avoid adding heavyweight dependencies without clear user-facing value.

## Anti-Patterns

Avoid:

- Refactors without user-facing or maintainability payoff
- Large rewrites in one PR
- Hosted-service assumptions
- Required API keys for basic examples
- Trace formats that are hard to diff in git
- Silent exception handling
- Overly broad LLM-as-judge features before deterministic checks are strong
- PR spam when an automation PR is already open

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`Rabuno/agentrec`), via the `gh` CLI. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — no repo-specific overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
