---
name: bdd-init
description: Bootstrap the BDD harness in a project — creates specs/, docs/TESTING_PHILOSOPHY.md tailored to the project's stack and to the test levels in scope, offers missing test levels (e.g. E2E for a frontend) and seeds their feature files, sets up .claude/bdd.config.json, the parity npm script and the hook wiring. Use when specs/ or docs/TESTING_PHILOSOPHY.md is missing, when the user says "set up BDD", "init BDD", "bdd init", or when /bdd finds the harness incomplete.
---

# /bdd-init — bootstrap the BDD harness

Idempotent. Re-running only fills what is missing and reports what already exists. Never overwrite a file the project already has without asking.

Paths below are relative to this skill's directory (wherever it is installed: `.claude/skills/bdd-init`, `.agents/skills/bdd-init`, or the global equivalent). `<this skill dir>` = that directory.

## 1. Inspect

Run:

```bash
node <this skill dir>/scripts/render-philosophy.mjs --detect
```

It prints the detected `traits` and `lang`. Traits:

| Trait | Detected from | Adds to the philosophy |
| --- | --- | --- |
| `frontend` | react / vue / svelte / angular / next / testing-library / jsdom | component + hook naming, "UI elements exist" + navigation branches, styling exclusion |
| `http-api` | fastify / express / koa / hono / nest / next | `METHOD /path` describe format, HTTP phrasing rows |
| `database` | drizzle / prisma / pg / mysql2 / typeorm / knex / mongoose | database row in doubles table |
| `e2e` | playwright / cypress / puppeteer / webdriverio | E2E level, `@e2e` tag, E2E environment section |
| `llm` | openai / anthropic / openrouter / ai / langchain / ollama | LLM row in doubles table |
| `observability` | langfuse / opentelemetry / sentry / pino / winston / axiom | tracing phrasing row |

It also prints `levels`: which test levels are **present** (unit / integration / e2e), which are **applicable** to the stack, and the difference as **suggested**.

Confirm the detection with the user in **one** message: list traits (offer to add/remove), ask where tests live if not obvious (`testGlobs`), and — for every suggested level — ask whether it is in scope. Non-JS projects: detection only picks language; ask for traits and levels explicitly.

## 1b. Missing test levels — offer, never assume

For each level in `levels.suggested`, ask once, with the reason:

| Level | Ask when | Reason to give |
| --- | --- | --- |
| `e2e` | frontend or http-api present, no browser/e2e runner | "5–10 browser (or API) journeys through the real stack catch catastrophic regressions unit tests cannot" |
| `integration` | http-api / database / frontend present, no integration suite | "boundary contracts (routes, repositories, rendering) need real in-process infra, not mocks" |

Outcomes:

- **Accepted** → the level is in scope. Keep its trait/tag. Right after step 2, write the first `.feature` files for it (see 2b). **No test code** — tests are written later by `/bdd` once each scenario is approved.
- **Declined** → the level is out of scope for now:
  - `e2e` declined → render the philosophy **without** the `e2e` trait (no E2E row, no `@e2e` tag, no E2E environment section) **and** remove `"e2e"` from `pyramidTags` in `.claude/bdd.config.json` so `check-feature.mjs` rejects an `@e2e` tag if one appears. Note in the report how to enable later (add the trait, re-render, restore the tag).
  - `integration` declined → keep the doc as is (integration is the default home for edge cases and cannot be removed without breaking the decision tree); record the decision in the report and set no expectation of an integration suite.
- **Already present** levels are never asked about.

## 2. Create what is missing

Check each item; create only if absent.

### `specs/`
```
specs/
  README.md
```
Write `specs/README.md` from [references/specs-README.md](references/specs-README.md). Path layout is fixed: `specs/<context>/<behaviour>.feature`. If the user wants a different specs directory, set `specsDir` in the config **and** update the `paths:` glob in `.claude/rules/bdd-spec.md`.

### `docs/TESTING_PHILOSOPHY.md`
```bash
node <this skill dir>/scripts/render-philosophy.mjs --traits <comma,list> --lang <Language> --out docs/TESTING_PHILOSOPHY.md
```
Omit `--traits`/`--lang` to use the detected values. The `e2e` trait means **E2E is in scope** (present or accepted in 1b) — pass the trait list explicitly whenever a level was declined. The script renders [references/TESTING_PHILOSOPHY.template.md](references/TESTING_PHILOSOPHY.template.md), dropping sections for absent traits. Afterwards read the output once and fix wording that only makes sense with a dropped trait (rare — the template is written to degrade cleanly).

If the file already exists: diff it against a fresh render (`--out` to a scratch path) and show the user the delta; replace only on approval.

### 2b. Seed feature files for an accepted level

Only when a suggested level was accepted in 1b. Goal: give the level a concrete backlog so the next `/bdd` run has something to bind.

1. Identify candidates from the code you can see (routes, pages, main user flows). `e2e` → the 5–10 **stable core happy paths** only (sign-in, the main create/read flow, the main submit flow). `integration` → boundary contracts that exist today (each route group, each repository, each page that renders data).
2. Write one `.feature` per context under `specs/<context>/`, every scenario tagged `@<level> @unimplemented`, phrased per § 7 (user language, no transport). Lint each file: `node .claude/hooks/check-feature.mjs <file>`.
3. Show the files and **stop** for approval — same gate as `/bdd` phase 1. Do not write tests, seeds, runner config or install a runner here; that happens in `/bdd` when a scenario is approved, and any new dependency (e.g. a browser runner) needs its own approval then.

`@unimplemented` keeps parity green until each scenario is picked up; `/bdd` removes the tag when it binds the test.

### `.claude/bdd.config.json`
Copy [references/bdd.config.default.json](references/bdd.config.default.json), then adjust `testGlobs`, `ignoreDirs` and `specsDir` to the project. Remove `"e2e"` from `pyramidTags` when E2E was declined in 1b. Non-JS runners: also adjust `phrasingBanlist` (the binding/naming hooks parse `it()`/`test()` + JSDoc; for other runners the parity script still works on `@scenario "<title>"` in any comment).

### Parity script in `package.json`
Add (if `package.json` exists and the key is absent):
```json
"bdd:check": "node .claude/hooks/bdd-parity.mjs"
```
Mention it as the CI gate.

### Scripts in `.claude/hooks/`
Copy [scripts/](scripts/) `{bdd-lib,bdd-gate,check-feature,check-test,bdd-parity}.mjs` → `.claude/hooks/` (create the folder). They are zero-dependency Node scripts used both as Claude Code hooks and as plain CLI checks (`/bdd`, `/bdd-regression`, CI). `render-philosophy.mjs` stays in this skill (it reads `references/` next to itself).

### Hooks in `.claude/settings.json` (Claude Code only)
Merge the entries from [references/hooks.settings.json](references/hooks.settings.json) into the project's `settings.json` under `hooks`. Do not duplicate an entry that already runs the same script. Do not drop existing hooks. Codex has no hooks: the scripts are run manually in the `/bdd` phases.

### Rules in `.claude/rules/` (Claude Code only)
Copy [references/rules/](references/rules/) `bdd-gate.md`, `bdd-spec.md`, `bdd-test.md` → `.claude/rules/`. `bdd-spec.md` and `bdd-test.md` are path-scoped and load only when matching files are edited.

### Gate rule in project instructions
Make sure `CLAUDE.md` / `AGENTS.md` does **not** `@`-include the full philosophy (it costs ~4k tokens per session; the rules under `.claude/rules/bdd-*.md` load it progressively). A single line is enough:

```
- Workflow: BDD, gated. `/bdd` for features, `/bdd-regression` for bugs. Rules: `docs/TESTING_PHILOSOPHY.md`.
```

## 3. Verify

```bash
node .claude/hooks/bdd-parity.mjs
node .claude/hooks/check-feature.mjs
node .claude/hooks/check-test.mjs
```

All three must run without a crash. Gaps reported by parity on an existing project are the backlog: list them to the user; do not fix them as part of init.

## 4. Report

Compact list: created / already existed / skipped (with reason), plus the level decisions (present / accepted + seeded feature files awaiting approval / declined + how to enable later). Then: "Next: `/bdd <feature>`" — or, if seed feature files are awaiting approval, "Next: approve the seeded scenarios, then `/bdd`".

## What ends up in the project

```
specs/README.md                          feature-file layout + commands
docs/TESTING_PHILOSOPHY.md               rendered for this stack
.claude/bdd.config.json                  scripts config
.claude/hooks/{bdd-lib,bdd-gate,check-feature,check-test,bdd-parity}.mjs
.claude/rules/{bdd-gate,bdd-spec,bdd-test}.md   (Claude Code)
.claude/settings.json                    hooks block merged (Claude Code)
package.json                             "bdd:check" script
```

The skills themselves (`bdd`, `bdd-init`, `bdd-regression`) are installed by `dev-skills`; install all three together.
