---
name: code-review
description: Review a diff, branch, pull request or file for correctness bugs, security issues and needless complexity, and report one severity-tagged finding per line with a concrete fix. Use when the user says "review", "code review", "review this PR / diff / file", or asks whether a change is safe to merge. Not for writing new features or for style-only feedback.
---

# Code review

Find what would break, leak or mislead. Report only what changes a decision. No praise, no restating the diff.

## 1. Scope the review

1. Determine the target: unstaged diff (`git diff`), staged (`git diff --cached`), branch (`git diff <base>...HEAD`), a PR (`gh pr diff <n>`), or named files. Ask if ambiguous.
2. Read the whole diff before commenting. For every changed function, read its callers and the tests that cover it — a change is judged by its blast radius, not its line count.
3. Note the project's rules (`CLAUDE.md`, `AGENTS.md`, lint config, testing philosophy). A finding that contradicts a project rule is invalid.

## 2. Hunt, in this order

| Priority | Look for |
| --- | --- |
| **Correctness** | wrong branch / off-by-one / null path / unhandled rejection / race / wrong default / lost error / mutation of shared state / broken invariant between two changed places |
| **Security** | unvalidated input at a boundary, injection (SQL/shell/HTML), secrets or PII in code/logs, auth or authz gaps, unsafe deserialization, path traversal, SSRF |
| **Data** | migrations without rollback, destructive ops without guard, schema/type drift between layers, timezone/encoding/float money handling |
| **Contract** | public API or event shape changed without version/consumers updated; error codes changed silently |
| **Tests** | changed behaviour with no test, tests that assert implementation instead of outcome, mocks of own code, deleted or weakened assertions |
| **Simplicity** | duplicated logic that already exists in the codebase, abstraction with one caller, dead code, config for hypothetical needs |
| **Performance** | N+1, unbounded loops/queries, sync I/O on a hot path, missing index for a new query — only when measurable |

Skip formatting and naming nits unless they change meaning.

## 3. Verify before reporting

Every finding must survive one of: reading the exact code path that produces the failure, running the test / script that demonstrates it, or citing the project rule it breaks. Uncertain → say "possible" and what would confirm it, or drop it.

## 4. Report

One line per finding, most severe first:

```
<path>:<line>: <severity>: <problem>. <fix>.
```

Severities: `🔴 blocker` (wrong result, data loss, security) · `🟠 major` (bug in an edge path, missing test for changed behaviour) · `🟡 minor` (simplification, dead code, doc mismatch) · `🔵 question` (needs the author's intent).

End with a verdict: `merge` · `merge after fixing blockers` · `do not merge` — and, if asked, apply the fixes with tests.

Example:

```
src/services/billing.ts:42: 🔴 blocker: `total` uses float addition on money. Use integer cents or the existing `Money` helper.
src/routes/users.ts:18: 🟠 major: `id` from the query string reaches the repository unvalidated. Parse with the route's zod schema.
src/lib/dates.ts:7: 🟡 minor: `formatDate` duplicates `lib/format/date.ts`. Import the existing one.
verdict: merge after fixing blockers
```
