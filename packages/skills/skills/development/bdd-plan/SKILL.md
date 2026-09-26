---
name: bdd-plan
description: Planning half of the BDD workflow — gather context, pick a track (S/M/L), draft tagged .feature scenarios with a plan, and stop at one approval gate that also resolves open decisions. Use when the user says "/bdd-plan" or wants scenarios written before any test or code. Called by /bdd; not for tests or production code (use /bdd-implement) and not for bug fixes (use /bdd-regression).
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 2.0.0
---

# BDD plan — Context → Draft → Gate 1

Turn one feature request into approved, tagged Gherkin scenarios plus an implementation plan, with as few human stops as accuracy allows. Only `specs/**/*.feature` may change here. The `/bdd` guardrails apply.

Standalone: run `node <bdd dir>/scripts/bdd-context.mjs --agent <agent> <keywords>` first; if the harness is not `complete`, tell the user to run `/bdd`.

## 1. Context

Use the `bdd-context` output: `matches` names the feature files to read; `config.commands` and `testGlobs` locate tests. Then read only what the plan needs, in parallel: the matching feature files, the production code the feature touches, and one neighboring test file per level you expect to use. Production code beats documentation. Do not read `docs/TESTING_PHILOSOPHY.md` — on Claude Code its extracts load automatically when you edit specs or tests; on Codex read `<bdd dir>/references/rules/bdd-spec.md` before drafting.

Facts are your job; decisions are the user's. An **open decision** is one that changes what a scenario's `Then` asserts (limits, error outcomes, authorization, visible results) and that code, specs, and the request do not settle. Anything that does not change observable behavior is yours to decide.

## 2. Track

| Track | When (all must hold for S; any triggers L) | Flow |
| --- | --- | --- |
| **S** | ≤3 scenarios, one context, existing test file(s), no new dependency/level/infra, 0 open decisions | draft → Gate 1 |
| **M** | default: ≤3 open decisions | draft → Gate 1 with the decisions inside it |
| **L** | >3 open decisions, several contexts, a new level/dependency/infra, >10 scenarios, or a vague request | interview → draft → Gate 1 |

The user can force a track ("full" → L). State the track in the Gate 1 report.

**L interview:** use the `grill-me` questioning style (frontier rounds, multiple choice, one recommendation, structured question tool) — at most 2 rounds of ≤4 questions — then go straight to drafting. Skip grill-me's Finish playback: the Gate 1 report is the playback.

## 3. Draft

1. Write or update the `.feature` files. Every scenario gets exactly one configured pyramid tag (lowest level that proves it), modifiers beside it, and a title unique across `specs/`. Every **new** scenario also gets `@unimplemented`; existing scenarios keep their tags.
2. For each open decision, draft the scenario with the **recommended** option and record the alternatives.
3. Lint: on Claude Code the `check-feature` hook reports on every edit — fix its findings; elsewhere run `node <bdd dir>/scripts/check-feature.mjs <files>`.
4. Before the gate, check the draft against the usual gaps — empty/invalid input, limits, unauthorized actor, not-found, duplicates, failure of an external dependency — and either cover each or list it as deliberately not covered.

## 4. Gate 1 — one stop

Report, then ask. This ends the turn.

```text
[bdd-plan] ready for review — track M
spec:  specs/<context>/<file>.feature  (+N new, M changed)
  - <title>  @unit @unimplemented
  - <title>  @integration @unimplemented
  - <title>  @e2e  (existing, updated)
assumed (recommended default — say if wrong):
  - <decision the draft took, one line each>
not covered (deliberate): <gap>, <gap>
plan:
  - <test file> ← <scenario titles or count> (@level)
  - code: <production files>
lint: <check-feature summary>
```

Then ask, in one structured-question call when available (Claude Code `AskUserQuestion`, Codex `request_user_input`), otherwise as numbered text:

- one question per open decision (M: ≤3). Recommended option first with `(Recommended)`; **every option states its effect on a scenario** ("→ scenario X asserts …").
- a final question: **"Approve the scenarios?"** — `Approve with these answers (Recommended)` · `Show me the revised scenarios first` · `I'll comment`.

S track asks only the approval question.

**Gate 1 is passed when:**
- the user picks *Approve with these answers*, or replies "ok" / "approved" / "go": apply any non-recommended answers to the scenarios exactly as their option described, re-lint, record approval with `node <bdd dir>/scripts/bdd-state.mjs implement --track <S|M|L> --feature <path>… --scenario "<title>"…`, and hand off;
- *Show me the revised scenarios first*: apply the answers, show the diff, ask the approval question again;
- a new requirement or a comment: return to Context or Draft.

## Handoff

Output: the approved feature-file paths, exact scenario titles (after applied answers), the track, and the plan block. `/bdd` passes these to `/bdd-implement`. Standalone: "Next: `/bdd-implement` with these scenarios."
