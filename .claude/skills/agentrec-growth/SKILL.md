# Agentrec Growth Skill

Use this skill when improving `agentrec`, especially during autonomous growth work, daily 10k-star upgrade runs, roadmap planning, PR creation, or developer-experience improvements.

## Mission

Make `agentrec` a high-quality developer tool with credible 10k-star potential.

Core positioning:

> Playwright for AI Agents — local-first regression testing for AI agents.

The goal is not to add random features. The goal is to make AI-agent debugging and regression testing feel obvious, easy, and production-ready.

## Research Loop

Before choosing a daily improvement, quickly inspect successful developer tools and AI tooling.

Prioritize inspiration from:

- Repos with >100k stars
- Developer tools with exceptional README/demo UX
- Testing/automation tools with strong CLI workflows
- Observability/debugging tools with great trace viewers
- AI-agent frameworks with strong adoption

Look for reusable patterns:

- 30-second quickstart
- screenshot/GIF above the fold
- zero-config first run
- simple mental model
- project templates/examples
- GitHub Action integration
- PR comments / CI artifacts
- stable JSON output for automation
- strong docs around real-world use cases

Do not blindly copy features. Translate the pattern into `agentrec`'s local-first regression-testing niche.

## Idea Selection

Pick exactly one focused improvement per PR.

Good daily PR scopes:

- Add `agentrec latest`
- Add golden baseline commands
- Add `diff --json`
- Improve report viewer sections
- Add mock OpenAI/Vercel AI SDK example
- Add YAML config for `agentrec test`
- Add GitHub Action docs or starter action
- Improve README positioning with concrete demo
- Add CI artifact/report workflow example

Bad daily PR scopes:

- Rewrite the architecture
- Add multiple unrelated features
- Refactor without product impact
- Add hosted-service assumptions
- Add required API keys to examples
- Generate PRs with tiny wording-only edits

## PR Value Gate

Create a PR only if at least one is true:

- It adds a command or workflow users can run.
- It adds an integration/example users can copy.
- It improves README/report/demo visibility.
- It fixes a bug/security issue with tests.
- It improves CI/testing in a meaningful way.

If none are true, stop and report a no-op instead of creating a low-value PR.

## Coding Workflow with Claude Code

1. Start from clean `main`.
2. Create a feature branch.
3. Delegate coding to Claude Code first.
4. Give Claude a narrow prompt with:
   - product goal
   - files likely affected
   - required tests
   - quality gates
   - no push/no secrets
5. If Claude Code fails or stalls:
   - narrow the task
   - retry after backoff if rate-limited
   - if still blocked, implement manually and report fallback
6. Review the diff before committing.

Preferred command shape:

```bash
export PATH="/opt/data/home/.npm-global/bin:$PATH"
claude -p '<focused implementation prompt>' \
  --allowedTools 'Read,Edit,Write,Bash' \
  --max-turns 10 \
  --output-format json
```

For pure diff review, pipe the diff and disable tools:

```bash
git diff main...HEAD | claude -p 'Review this diff for correctness, API compatibility, security, and test gaps. Do not modify files.' --tools '' --max-turns 1 --output-format json
```

## Required Verification

Run before opening PR:

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
```

Also run a CLI smoke test if the change affects CLI flows.

## PR Body Template

Use this structure:

```markdown
## Summary
- ...

## Research inspiration
- Repo/pattern: ...
- Applied idea: ...

## What changed
- ...

## Test plan
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm audit --audit-level=moderate`

## Risks / follow-ups
- ...
```

## Safety and Product Constraints

- Never commit secrets, API keys, tokens, or private traces.
- Redaction should be on by default.
- Keep trace artifacts local-first and git-friendly.
- Do not push directly to `main` in autonomous mode.
- Do not merge PRs.
- Do not create a new PR if an automation PR is already open and waiting for review.
- If GitHub/Claude rate limits occur, back off and report clearly rather than loop forever.

## Launch Quality Checklist

A change is more likely to earn stars if it improves at least one of:

- First-run success
- README clarity
- Screenshot/GIF/demoability
- CI integration
- Real framework integration
- Debugging insight
- Regression confidence
- Privacy/security posture
