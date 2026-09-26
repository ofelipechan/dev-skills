---
name: bdd
description: BDD workflow feature development, function or business rule. This skill is user-invoked only — trigger ONLY when the user explicitly types "/bdd" or explicitly asks to use BDD (e.g. "set up BDD", "use BDD for this"). Not for bug fixes (use /bdd-regression) or pure refactors with green tests.
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 3.0.0
---

# BDD — Behavior-Driven Development

Plan and implement one feature through approved scenarios, red tests, and verified code. This skill owns the harness and orchestrates two phase skills:

| Step | Skill | Covers | Human stops |
| --- | --- | --- | --- |
| 1 | `bdd-plan` | Context → track → draft scenarios + plan → **Gate 1** (approval + open decisions in one message) | 1 (S/M), 2–3 (L) |
| 2 | `bdd-implement` | Red tests → code → one-call verify → report | 0 |

If a phase skill is not installed: `npx @ofelipechan/dev-skills install bdd-plan bdd-implement`.

Accuracy comes from four things; everything else in the flow is kept lean: **one approval of the scenarios**, **tests written to the behavior before code, run once code lands**, **deterministic scripts** (lint, parity, verify) instead of judgement, **never weakening a test**.

## Guardrails

These apply to both phase skills.

- Gate 1 precedes every test or production change. Never start `bdd-implement` in the same turn as the Gate 1 question; approval is the user's next message.
- Each implemented scenario has exactly one test binding; scenario titles stay stable (rename title and binding together).
- Every new scenario starts `@unimplemented`; the tag comes off only when its bound test is green.
- Test levels are per project: use `pyramidTags` from the current agent's config; adding a level is a separate harness change requiring approval.
- Leave git state untouched unless the user explicitly requests a git operation.
- Make progress visible through artifacts and gate evidence, not phase narration. Summarize command results; never dump raw output.

## Scripts

`<bdd dir>` is the installed `bdd` skill folder (`.claude/skills/bdd`, `.agents/skills/bdd`, or the global equivalent); its `scripts/` are also copied to `.claude/hooks/` / `.agents/hooks/` at init. `<agent>` is `claude` (Claude Code) or `codex` (Codex).

| Script | Use |
| --- | --- |
| `bdd-context.mjs --agent <agent> [keywords…]` | preflight + config + commands + spec layout + matching scenarios + backlog + parity, one call |
| `check-feature.mjs <files>` / `check-test.mjs <files>` | lint (Claude runs them as hooks on every edit) |
| `bdd-untag.mjs "<title>"…` | drop `@unimplemented` from green, bound scenarios in one call |
| `bdd-verify.mjs [--all]` | lint changed files + parity + configured commands for touched levels + lint + typecheck, concurrently |
| `bdd-state.mjs plan / implement / done` | record the run phase: `plan` makes the gate hook deny test/production edits, `implement` silences it, `done` clears it; `bdd-context` prints it as `run` so a new session can resume |
| `bdd-hook.mjs --pre / --post` | Claude Code hook entry point (gate before edits; feature/test lint after) |

## Preflight

Run `node <bdd dir>/scripts/bdd-context.mjs --agent <agent> <2–4 keywords from the request>`.

- `preflight.<agent>.status` is `complete` → keep the output as Discovery context and go to step 1.
- `run` is not null → a previous run was interrupted: tell the user its phase and scenarios and offer to resume it (`implement` → go to step 2) or discard it (`bdd-state.mjs done`).
- `incomplete` or `invalid` → follow [references/init.md](references/init.md). Initialization has its own approval gate; its question ends the turn. Resume only after initialization reports the current agent as `complete`.

The project config is agent-specific (`.claude/bdd.config.json`, `.agents/bdd.config.json`). Its `commands` block holds the test, lint and typecheck commands; never rediscover them. A missing command is a harness gap: report it, then fall back to the project's own scripts.

## 1 — Plan

Run `node <bdd dir>/scripts/bdd-state.mjs plan`, then `bdd-plan` (`/bdd-plan`) with the user's request and the context output. It ends at Gate 1. A question or new requirement stays inside `bdd-plan`.

## 2 — Implement

After Gate 1, run `bdd-implement` (`/bdd-implement`) with the approved feature-file paths, exact scenario titles, track, and the plan from the Gate 1 report. Its `[bdd-implement finished]` report closes the run; `bdd-implement` clears the state.
