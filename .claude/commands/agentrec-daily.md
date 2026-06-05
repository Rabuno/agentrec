# Agentrec Daily Growth Run

Use this command when doing a focused autonomous improvement pass for `agentrec`.

Follow `CLAUDE.md` and the `agentrec-growth` skill.

## Steps

1. Confirm clean working tree.
2. Pull latest `main`.
3. Check whether an automation PR is already open.
4. Research one high-signal developer-tool pattern from successful GitHub repos.
5. Choose exactly one focused improvement.
6. Implement it with tests/docs.
7. Run quality gates:
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
   - `npm audit --audit-level=moderate`
8. Commit with a conventional commit message.
9. Push a feature branch and create a PR into `main`.
10. Do not merge.

Arguments from user:

$ARGUMENTS
