---
name: bdd-plan
description: Planning half of the BDD workflow — Discovery (read config, specs, code; interview the user) and Specify (write tagged .feature files, lint them, stop for approval). Use when the user says "/bdd-plan" or wants scenarios written before any test or code. Called by /bdd; not for tests or production code (use /bdd-implement) and not for bug fixes (use /bdd-regression).
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 1.0.0
---

# BDD plan — Discovery → Specify

Turn one feature request into approved, tagged Gherkin scenarios. This skill ends at the approval request; it never writes tests or production code. `/bdd` runs it as phases 1–2 and continues with `/bdd-implement` once the user approves.

## Guardrails

- Test and production files remain untouched. Only `specs/**/*.feature` may change.
- Every new scenario starts `@unimplemented`; existing scenarios keep their current tags.
- Scenario titles stay unique across `specs/` and are the contract later phases bind to. Rename a title only together with its binding.
- Leave git state untouched unless the user explicitly requests a git operation.
- Name the active phase only when entering it, requesting approval, or reporting a blocker. Summarize command results instead of dumping raw output.

## Prerequisites

The BDD harness must exist: the current agent's `bdd.config.json` (`.claude/bdd.config.json` for Claude Code, `.agents/bdd.config.json` for Codex), `specs/`, and `docs/TESTING_PHILOSOPHY.md`. `/bdd` verifies this with its preflight before calling this skill. When running standalone and something is missing, stop and tell the user to run `/bdd` (its preflight bootstraps the harness).

`<bdd skill dir>` below is the installed `bdd` skill folder (`.claude/skills/bdd`, `.agents/skills/bdd`, or the global equivalent). Its `scripts/` are also copied to `.claude/hooks/` / `.agents/hooks/` at init; either location works.

**Test levels are per project, not fixed.** Use `pyramidTags` from the current agent's config. Tag scenarios only with configured levels. Adding a missing level is a separate harness change requiring user approval.

## 1/2 — Discovery

1. Read the current agent's `bdd.config.json`; `testGlobs` identifies the code and test roots.

2. Under `specs/` there might be subfolders, each representing a context (a domain, service, cluster). Each may have multiple `.feature` files written in Gherkin syntax describing user-facing behaviour. Read the relevant feature files to gather context about current business logic.

3. Explore the repository to understand the current state of the codebase. Locate any existing code that is relevant to what you are planning to build, or missing pieces you will need to add. The production code itself is more relevant than any documentation you may read, because it represents the current state of the application, while documentation may be outdated.

4. Interview the user until every behavior decision is explicit. Run the `grill-me` skill (`/grill-me`; if not installed: `npx @ofelipechan/dev-skills install grill-me`). It owns the interview: design tree, frontier rounds, multiple-choice questions with one recommendation, structured question tool when available. Scale it to the request: a small unambiguous change may need no questions; a vague change needs the full interview. Typical decisions here: edge cases, error outcomes, limits, authorization, visible results. Environmental facts come from step 3 — the user only answers decisions.

Discovery is complete when the frontier is empty and the user confirms the shared understanding and is good to proceed.

## 2/2 — Specify

Context: `docs/TESTING_PHILOSOPHY.md` explains how to write feature files and tests.

1. Write or update the `.feature` files from the confirmed design tree. Give every scenario exactly one configured pyramid tag, place modifiers beside it, and keep titles unique across `specs/`. Tag every **new** scenario `@unimplemented` as well; it tracks which scenarios still lack green production code. Existing scenarios keep their current tags.
2. Run `node <bdd skill dir>/scripts/check-feature.mjs <file>` for every changed feature file. Fix syntax, tag, phrasing, and duplicate-title findings; return behavior questions to Discovery.
3. Report every added or modified file, scenario title, and pyramid tag. Show the relevant diff and validator result, then stop:

   ```text
   [bdd-plan] ready for review
   added:     specs/<context>/<file>.feature
   modified:  specs/<context>/<other>.feature
   scenarios:
     - <title>  @unit @unimplemented
     - <title>  @integration @unimplemented
     - <title>  @e2e  (existing, updated)
   ```

   Ask: "Approve these scenarios to continue to tests, or tell me what to change."

**Gate 1**: explicit approval in chat. "ok", "approved", and "go" count. A question or new requirement returns to Discovery or Specify. This question ends the turn; nothing follows it.

## Handoff

After approval, the output of this skill is:

- the approved feature-file paths;
- the exact approved scenario titles.

`/bdd` passes these to `/bdd-implement`. Standalone, tell the user: "Next: `/bdd-implement` with these scenarios."
