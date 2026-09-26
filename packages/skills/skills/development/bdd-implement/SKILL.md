---
name: bdd-implement
description: Implementation half of the BDD workflow — Bind tests (red), Implement, Verify — for scenarios the user has already approved. Use when the user says "/bdd-implement" or asks to implement approved .feature scenarios. Called by /bdd after Gate 1; not for writing or changing scenarios (use /bdd-plan) and not for bug fixes (use /bdd-regression).
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 2.0.0
---

# BDD implement — Red → Green → Verify

Take approved scenarios to green, verified code through a red test first. The `/bdd` guardrails apply, plus:

- Phase 1 changes tests and scenario bindings only; phase 2 owns production code.
- Keep own code real; inject fakes only at external seams.
- Never weaken, skip, or delete a test to get green.

## Inputs

The approved feature-file paths, exact scenario titles, track (S/M/L), and plan from the Gate 1 report. Commands come from `commands` in the current agent's `bdd.config.json` (`bdd-context.mjs` prints them).

Standalone, without approval of these scenarios in this conversation: list the scenarios found (with tags) and ask for approval before touching any file. That question ends the turn. On approval, record it with `bdd-state.mjs implement --feature … --scenario …` (the gate hook denies test and production edits while a run is in the plan phase).

## 1/3 — Red

Follow [references/test-binding.md](references/test-binding.md).

- **S / M:** this session binds the tests — it already holds the context. Do not delegate: a single sequential subagent only adds a cold start.
- **L with ≥2 independent test files:** when subagents are available, spawn one per test file **in parallel**. Give each the feature paths, its scenario titles, its target test file, the plan block, the matching `commands` entry, and the path to `test-binding.md`. Wait for every `RED` / `BLOCKED` report.

**Gate 2:** every approved scenario is bound and lint is clean. Do not run the tests yet — red is assumed from the missing behavior, not verified. Scenarios keep `@unimplemented`.

## 2/3 — Green

1. Implement only what the approved scenarios require, respecting the project's architecture.
2. After each unit of work, run the focused command for the touched level(s) and fix failures caused by the change. This is the first run of the bound tests — confirm they now pass, not merely that they no longer fail for the missing-behavior reason.
3. After each green run, untag every scenario whose bound test **ran and passed** in that run in one call: `node <bdd dir>/scripts/bdd-untag.mjs "<title>" …`. It refuses unbound or unknown titles. Never untag ahead of a green test, and never untag a scenario whose test did not run (skipped level, a command you chose not to run, blocked environment) — no hook or check overrides this; if the run stops midway, the remaining tags show what is undone.
4. After two failed attempts on the same test, stop and report the diagnosis and attempts; leave `@unimplemented` on every scenario that is not green.

**Gate 3:** every bound test that could run is green, none weakened or deleted, no green scenario still `@unimplemented`.

## 3/3 — Verify

1. Run `node <bdd dir>/scripts/bdd-verify.mjs` — one call: lint of changed specs/tests, parity, configured tests for every touched level (scoped to changed test files), lint, typecheck, run concurrently. Add `--all` for L track or when shared code changed. A `skip` line means a command is missing from config: run the project's equivalent yourself and report the gap.
2. Fix failures caused by this work and rerun. Report unrelated or environment failures with the exact command and result; never describe an unrun or failing check as passing.
3. Review the diff: every production change serves an approved scenario; no test removed, skipped, or weakened; `@unimplemented` removed only from scenarios whose bound test ran green in this session — a test that could not run (environment, migration, unavailable runner) keeps the tag and is listed in the report with the reason; no unrelated files; no unused imports.
4. **L track:** when subagents are available, run an independent diff review (e.g. `code-review`) in the background while verify runs, and address its confirmed findings.

## Report

Run `node <bdd dir>/scripts/bdd-state.mjs done` — unless scenarios remain `@unimplemented` because the run stopped early; then keep the state so the next session can resume.

```text
[bdd-implement finished] <feature>
goal:  <one sentence>
spec:  specs/<context>/<file>.feature  (+N scenarios: a @unit, b @integration, c @e2e; d @unimplemented)
tests: <files>  (N bound)
code:  <files>
run:   bdd-verify → <ok checks> · <failures/skips, if any>
kept:  <scenarios still @unimplemented> — <why: not run / deferred / blocked>
```
