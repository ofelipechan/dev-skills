---
name: bdd-implement
description: Implementation half of the BDD workflow — Bind tests (red), Implement, Verify — for scenarios the user has already approved. Use when the user says "/bdd-implement" or asks to implement approved .feature scenarios. Called by /bdd after Gate 1; not for writing or changing scenarios (use /bdd-plan) and not for bug fixes (use /bdd-regression).
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 1.0.0
---

# BDD implement — Bind tests → Implement → Verify

Take approved scenarios to green, verified code through a red test first. `/bdd` runs this as phases 3–5 after `/bdd-plan`'s Gate 1. Make progress visible through artifacts and gate evidence, not repeated phase narration. Name the active phase only when entering it or reporting a blocker. Keep evidence concise; summarize command results instead of dumping raw output.

## Inputs

- the approved feature-file paths;
- the exact approved scenario titles.

Standalone, without explicit approval of these scenarios in this conversation: list the scenarios you found (with tags) and ask for approval before touching any file. That question ends the turn.

## Guardrails

- Phase 1 changes tests and scenario bindings only; phase 2 owns production code.
- Each implemented scenario has exactly one test binding.
- Scenario titles stay stable; rename a title and its binding together.
- Keep own code real and inject fakes only at external seams.
- `@unimplemented` comes off one scenario at a time, only when its bound test is green. A scenario deferred past this run keeps the tag.
- Never weaken, skip, or delete a test to get green.
- Leave git state untouched unless the user explicitly requests a git operation.

`<bdd skill dir>` below is the installed `bdd` skill folder (`.claude/skills/bdd`, `.agents/skills/bdd`, or the global equivalent). Its `scripts/` are also copied to `.claude/hooks/` / `.agents/hooks/` at init; either location works. Read the current agent's `bdd.config.json` (`.claude/bdd.config.json` for Claude Code, `.agents/bdd.config.json` for Codex); `pyramidTags` lists the configured test levels and `testGlobs` the test roots. Run commands only for configured levels.

## 1/3 — Bind tests (Red)

Either this session or a subagent (if available) will execute this phase.

### Choose the owner

Use the approved scenarios and known repository context to estimate the test impact (low or broad).

The main agent session owns this phase only when the impact is low, meaning all of the following are true:
- changes are limited to one existing test file;
- the correct test location is already known;
- no fixture, seed, runner, configuration, or dependency changes are needed.

If any condition is false—or cannot be confirmed with a targeted lookup—the work has broad test impact.

- When subagents are available, delegate broad-impact work to one subagent.
- When subagents are unavailable, the main agent (current session) handles it as a fallback.

### Execute the binding

**The agent that owns this phase** reads and follows [references/test-binding.md](references/test-binding.md). If you don't own this phase, you don't need to read `test-binding.md`.

For delegated work, provide the subagent with:

- the approved feature-file paths;
- the exact approved scenario titles;
- the path to `references/test-binding.md`.

The subagent follows applicable project instructions, changes no production code, and returns the contract's `RED` or `BLOCKED` report. Wait for that report before starting implementation.

**Gate 2**: every approved scenario is bound, validators are clean, and focused tests are red for the missing behavior. Scenarios keep `@unimplemented` through this phase; the tag reflects production code, not tests.

## 2/3 — Implement

1. Implement only what the approved scenarios require.
2. Respect the project's architecture and validation rules.
3. Run the focused scope after each unit of work and fix failures caused by the change.
4. As soon as one scenario's bound test is green, remove `@unimplemented` from that scenario in its `.feature` file — one scenario at a time, in the same unit of work. Never strip the tag in bulk up front; if the run stops midway, the remaining tags show exactly what is still undone.
5. After two failed attempts on the same test, stop and report the diagnosis and attempts. Leave `@unimplemented` on every scenario that is not green.

**Gate 3**: all bound tests are green, no test was weakened or deleted to achieve it, and no green scenario still carries `@unimplemented`.

## 3/3 — Verify

Verify the completed behavior from narrowest to broadest. A small change (one test file, one production unit) runs parity plus the focused tests; every other size runs the full sequence below.

1. Revalidate every changed BDD artifact:
```bash
node <bdd skill dir>/scripts/check-test.mjs <changed test files>
node <bdd skill dir>/scripts/bdd-parity.mjs
<project test command for every touched configured level>
<project lint / typecheck>
```

2. Run the focused tests for the approved scenarios and related files. Use commands already defined by the project (e.g. lint, typecheck, unit tests, E2E, integration, etc.); do not guess or introduce new verification tooling.

3. Review the final diff and confirm:
- each production change supports an approved scenario;
- no test was removed, skipped, or weakened;
- `@unimplemented` remains only on scenarios the user agreed to defer; every green scenario has lost it;
- no unrelated files or behavior were changed.

If a check fails, fix failures caused by this work and rerun the affected verification sequence. Report unrelated or environment-blocked failures with the exact command and result, explaining why it failed; never describe an unrun or failing check as passing.

Verification is complete only when BDD validators and parity are clean, all touched test levels pass, required project checks pass, and the final diff remains within the approved scope. Remove unused imports and leave nothing deferred beyond explicitly tagged `@unimplemented` scenarios.

## Report

```text
[bdd-implement finished] <feature>
goal: (explain in one sentence)
spec:   specs/<context>/<file>.feature  (+N scenarios: a @unit, b @integration, c @e2e; d @unimplemented)
tests:  <files>  (N bound)
code:   <files>
run:    <command> → pass (N tests) · lint ok · types ok · parity ok
```
