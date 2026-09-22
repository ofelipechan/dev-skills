---
name: bdd
description: BDD workflow for a new feature, function or business rule — preflight → /bdd-plan (interview, feature file, approval) → /bdd-implement (red tests, code, verify). Use whenever the user says "/bdd" or uses terms that indicate BDD (e.g. "set up BDD", "use BDD"). Not for bug fixes (use /bdd-regression) or pure refactors with green tests.
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 2.0.0
---

# BDD — Behavior-Driven Development

Plan and implement one feature through explicit behavior, a red test, and verified code. This skill owns the harness (preflight and initialization) and orchestrates two phase skills:

| Step | Skill | Covers |
| --- | --- | --- |
| 1 | `bdd-plan` | Discovery (context, interview) → Specify (feature files, lint, **Gate 1** approval) |
| 2 | `bdd-implement` | Bind tests (red, **Gate 2**) → Implement (**Gate 3**) → Verify → report |

If a phase skill is not installed: `npx @ofelipechan/dev-skills install bdd-plan bdd-implement`.

Make progress visible through artifacts and gate evidence, not repeated phase narration. Name the active phase only when entering it, requesting approval, or reporting a blocker. Keep evidence concise; summarize command results instead of dumping raw output.

## Guardrails

- Gate 1 (scenario approval, owned by `bdd-plan`) precedes every test or production change.
- Never start `bdd-implement` in the same turn as the Gate 1 question; approval is the user's next message.
- Each implemented scenario has exactly one test binding; scenario titles stay stable.
- Every new scenario starts `@unimplemented`; the tag comes off one scenario at a time, only when its bound test is green.
- Leave git state untouched unless the user explicitly requests a git operation.

## Preflight

Run the deterministic check first:

```bash
node <this skill dir>/scripts/bdd-preflight.mjs --agent <agent>
```

`<agent>` is the agent you are running as: `claude` for Claude Code, `codex` for Codex. The report covers that agent only, e.g. `{ "claude": { "status": "complete", "missing": [], "problems": [] } }`. Other agents' harnesses never block you.

- `complete` → continue to step 1.
- `incomplete` or `invalid` → follow [references/init.md](references/init.md). Initialization has its own approval gate; its question ends the turn. Resume only after initialization reports the current agent as `complete`.

The project config is agent-specific: `.claude/bdd.config.json` for Claude Code and `.agents/bdd.config.json` for Codex. Each agent reads and validates its own config; the files may differ.

**Test levels are per project, not fixed.** Use `pyramidTags` from the current agent's config. Tag scenarios, choose test locations, and run commands only for configured levels. Adding a missing level is a separate harness change requiring user approval.

## 1 — Plan

Run the `bdd-plan` skill (`/bdd-plan`) with the user's feature request. It performs Discovery and Specify and stops at Gate 1 with the `[bdd-plan] ready for review` report. Wait for the user's explicit approval ("ok", "approved", "go"). A question or new requirement stays inside `bdd-plan`.

## 2 — Implement

After Gate 1, run the `bdd-implement` skill (`/bdd-implement`) with:

- the approved feature-file paths;
- the exact approved scenario titles.

It binds red tests, implements, verifies, and ends with the `[bdd-implement finished]` report. That report closes the `/bdd` run; do not duplicate it.
