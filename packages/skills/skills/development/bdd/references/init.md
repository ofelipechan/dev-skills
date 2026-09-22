# BDD harness initialization

Reference for `/bdd` preflight. Use when `bdd-preflight.mjs` reports the current agent as `incomplete` or `invalid`, or when the user asks to set up BDD. Bootstraps `specs/`, a stack-specific `docs/TESTING_PHILOSOPHY.md`, agent-specific configs, the parity npm script, and supported hook wiring.

Idempotent. Re-running only fills what is missing and reports what already exists. Never overwrite a file the project already has without asking.

Paths below are relative to the `bdd` skill's directory (wherever it is installed: `.claude/skills/bdd`, `.agents/skills/bdd`, or the global equivalent). `<this skill dir>` = that directory. `references/` (this file's directory) and `scripts/` sit directly under it.

Determine the target agents before proposing changes. Always include the invoking agent; also include an agent with a project installation at `.claude/skills/bdd` or `.agents/skills/bdd`, and honor any agents the user names explicitly. Claude's project config is `.claude/bdd.config.json`; Codex's is `.agents/bdd.config.json`.

Announce `[bdd init]` at the start of each message while in this flow.

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

Detection is a guess. Confirm it with the user before creating anything — see **1c** for the exact format. Non-JS projects: detection only picks language; ask for traits and levels explicitly.

## 1b. Missing test levels — offer, never assume

For each level in `levels.suggested`, ask once (inside the 1c message), with the reason:

| Level | Ask when | Reason to give |
| --- | --- | --- |
| `e2e` | frontend or http-api present, no browser/e2e runner | "5–10 browser (or API) journeys through the real stack catch catastrophic regressions unit tests cannot" |
| `integration` | http-api / database / frontend present, no integration suite | "boundary contracts (routes, repositories, rendering) need real in-process infra, not mocks" |

Outcomes:

- **Accepted** → the level is in scope. Keep its trait/tag. Right after step 2, write the first `.feature` files for it (see 2b). **No test code** — tests are written later by `/bdd` once each scenario is approved.
- **Declined** → the level is out of scope for now:
  - `e2e` declined → render the philosophy **without** the `e2e` trait (no E2E row, no `@e2e` tag, no E2E environment section) **and** remove `"e2e"` from `pyramidTags` in every target agent config so `check-feature.mjs` rejects an `@e2e` tag if one appears. Note in the report how to enable later (add the trait, re-render, restore the tag).
  - `integration` declined → keep the doc as is (integration is the default home for edge cases and cannot be removed without breaking the decision tree); record the decision in the report and set no expectation of an integration suite.
- **Already present** levels are never asked about.

## 1c. How to ask — one message, readable, one decision per question

The user has not seen the detector output and does not know what a "trait" is. Two parts: a **summary** (always chat text — the tables and lists below) and the **questions**.

- **Agent has a structured question tool** (Claude Code: `AskUserQuestion`) → post the summary as text, then ask the questions through the tool in the same turn: one call, one question per numbered item below, `header` = the item's topic, 2–4 options each with a one-line description, recommended option **first** with ` (Recommended)` on its label. Do not also write the questions as text.
- **No such tool** → the numbered questions as chat text, each with its options and the recommended one marked `(Recommended)`.

Summary + questions in this shape:

```
[bdd init] I inspected the project. Please review before I create anything.

**Stack detected** (each row adds sections to docs/TESTING_PHILOSOPHY.md)
| Trait | Because I found | What it adds |
| --- | --- | --- |
| frontend | react, testing-library in apps/web | component/hook naming rules, UI + navigation scenarios |
| http-api | fastify in apps/communication-service | `METHOD /path` describe format, HTTP phrasing |
| … | … | … |

**Test levels**
- present: unit (apps/web/src/**/*.test.tsx, apps/communication-service/test/**/*.test.ts)
- present: e2e (apps/web/e2e/**/*.spec.ts, playwright)
- missing but applicable: integration

**Will be created**: specs/, docs/TESTING_PHILOSOPHY.md, <one bdd.config.json per target agent>, <agent runtime scripts>, Claude rules/hooks when Claude is targeted, "bdd:check" npm script.
**Already exists (untouched)**: <list or "nothing">
```
```
Questions:
1. Traits — keep this list?
   (a) Keep as detected (Recommended)   (b) Adjust — tell me what to add/remove
2. Test locations — are these globs right?
   apps/web/src/**/*.test.ts(x)
   apps/web/e2e/**/*.spec.ts
   apps/communication-service/test/**/*.test.ts
   (a) Correct (Recommended)   (b) Missing a package   (c) Wrong pattern
3. Integration tests — none found. In scope? Reason: boundary contracts (routes, repositories, rendering) need real in-process infra, not mocks.
   (a) Yes, in scope (Recommended) — I seed feature files for it   (b) No, skip for now — can be enabled later
```

Rules for this message:

- **One question per decision, always multiple choice.** Traits, test globs and each suggested level are separate items — never merged into one "Confirm?". Each has 2–4 options and one `(Recommended)`.
- **Show evidence, not labels.** For each trait, name the dependency or file that triggered it. "frontend" alone means nothing to the user; "react in apps/web" does.
- **Spell out the consequence** of each answer in a few words (what gets created, what gets skipped, whether it can be enabled later).
- **Full paths, one per line** for test globs. Do not inline a comma-separated list of globs in a heading.
- **Say what will be written** before asking. The user must know the files this will create in their repo.
- Keep the whole message under ~40 lines. Drop the traits table rows that were not detected; do not explain traits that do not apply.
- **This message is the end of your turn.** Nothing follows it: no tool calls, no file creation, no rendering, no `[bdd 1/5 discovery]` — not even when the answer looks obvious or every level is already present. The next thing that happens is the user's reply.

**Gate 0**: explicit reply — the tool's answers, or "confirm" / "ok" / "go" / answers to the numbered items in chat. Silence does not. If init was entered from `/bdd` preflight, the `/bdd` run resumes only after this gate **and** after step 4's report — never in the same message as the question.

Same rule after step 2 when `docs/TESTING_PHILOSOPHY.md` already exists (replace / keep / merge question) and after 2b (seed scenarios): each of those questions ends the turn.

## 2. Create what is missing

Check each item; create only if absent.

### `specs/`
```
specs/
  README.md
```
Write `specs/README.md` from [specs-README.md](specs-README.md). Path layout is fixed: `specs/<context>/<behaviour>.feature`. If the user wants a different specs directory, set `specsDir` in every agent config and update the `paths:` glob in `.claude/rules/bdd-spec.md` when Claude is targeted.

### `docs/TESTING_PHILOSOPHY.md`
```bash
node <this skill dir>/scripts/render-philosophy.mjs --traits <comma,list> --lang <Language> --out docs/TESTING_PHILOSOPHY.md
```
Omit `--traits`/`--lang` to use the detected values. The `e2e` trait means **E2E is in scope** (present or accepted in 1b) — pass the trait list explicitly whenever a level was declined. The script renders [TESTING_PHILOSOPHY.template.md](TESTING_PHILOSOPHY.template.md), dropping sections for absent traits. Afterwards read the output once and fix wording that only makes sense with a dropped trait (rare — the template is written to degrade cleanly).

If the file already exists: diff it against a fresh render (`--out` to a scratch path) and show the user the delta, summarised as "sections added / sections removed / lines changed" plus the diff itself. Then ask, as its own message:

> `docs/TESTING_PHILOSOPHY.md` already exists. Replace it with the render above (your edits in the removed lines would be lost), keep the current file, or should I merge specific sections? — reply **replace** / **keep** / list the sections.

Default on an unclear answer: keep. This question ends the turn.

### 2b. Seed feature files for an accepted level

Only when a suggested level was accepted in 1b. Goal: give the level a concrete backlog so the next `/bdd` run has something to bind.

1. Identify candidates from the code you can see (routes, pages, main user flows). `e2e` → the 5–10 **stable core happy paths** only (sign-in, the main create/read flow, the main submit flow). `integration` → boundary contracts that exist today (each route group, each repository, each page that renders data).
2. Write one `.feature` per context under `specs/<context>/`, every scenario tagged `@<level> @unimplemented`, phrased per § 7 (user language, no transport). Lint each file with `<this skill dir>/scripts/check-feature.mjs`.
3. Show the files and **stop** for approval — same gate as `/bdd` phase 1. Per file: the path, then one line per scenario (`- <title> — @<level> @unimplemented`). End with exactly:

   > These are seed scenarios only — no tests, no runner, no code yet. Approve them to add to the backlog, remove the ones you do not want, or tell me what to change.

   Do not write tests, seeds, runner config or install a runner here; that happens in `/bdd` when a scenario is approved, and any new dependency (e.g. a browser runner) needs its own approval then.

`@unimplemented` keeps parity green until each scenario is picked up; `/bdd` removes the tag once the scenario's bound test is green.

### Agent configs

For each target, copy [bdd.config.default.json](bdd.config.default.json), then adjust `testGlobs`, `ignoreDirs`, `specsDir`, and `pyramidTags` for that agent:

- Claude Code → `.claude/bdd.config.json`
- Codex → `.agents/bdd.config.json`

Configs are independent and may differ. Preserve an existing agent's values unless the user approves changing that agent. Non-JS runners also need an adjusted `phrasingBanlist`.

### Parity script in `package.json`
For one target, add its parity command if `package.json` exists and the key is absent:
```json
"bdd:check": "node <target agent runtime dir>/bdd-parity.mjs"
```

For both targets, add agent-specific commands and make the aggregate run both:

```json
"bdd:check:claude": "node .claude/hooks/bdd-parity.mjs",
"bdd:check:codex": "node .agents/hooks/bdd-parity.mjs",
"bdd:check": "npm run bdd:check:claude && npm run bdd:check:codex"
```

Mention `bdd:check` as the CI gate.

### Runtime scripts

Copy `{bdd-lib,bdd-gate,bdd-preflight,check-feature,check-test,bdd-parity}.mjs` from `<this skill dir>/scripts/` into each target runtime directory:

- Claude Code → `.claude/hooks/`
- Codex → `.agents/hooks/`

Each runtime directory reads only its agent's config. `render-philosophy.mjs` stays in the installed skill because it reads the adjacent template.

### Hooks in `.claude/settings.json` (Claude Code only)
Merge the entries from [hooks.settings.json](hooks.settings.json) into the project's `settings.json` under `hooks`. Do not duplicate an entry that already runs the same script. Do not drop existing hooks. Codex runs the scripts explicitly from `.agents/hooks/`.

### Rules in `.claude/rules/` (Claude Code only)
Copy [rules/](rules/) `bdd-gate.md`, `bdd-spec.md`, `bdd-test.md` → `.claude/rules/`. `bdd-spec.md` and `bdd-test.md` are path-scoped and load only when matching files are edited.

### Gate rule in project instructions
Make sure `CLAUDE.md` / `AGENTS.md` does **not** `@`-include the full philosophy (it costs ~4k tokens per session; the rules under `.claude/rules/bdd-*.md` load it progressively). A single line is enough:

```
- Workflow: BDD, gated. `/bdd` for features, `/bdd-regression` for bugs. Rules: `docs/TESTING_PHILOSOPHY.md`.
```

## 3. Verify

```bash
# checks every scenario in specs/ has exactly one test bound to it, and every bound test has a scenario
node <each target agent runtime dir>/bdd-parity.mjs
# lints all .feature files: one pyramid tag per scenario, no unknown tags, unique titles, user-language phrasing
node <each target agent runtime dir>/check-feature.mjs
# lints all test files: no "should" titles, no skipped bindings, @scenario titles match specs exactly, no double binding
node <each target agent runtime dir>/check-test.mjs
```

All three must run without a crash (a crash means the config or the copied scripts are wrong; findings are not a crash). Gaps reported by parity on an existing project are the backlog: list them to the user; do not fix them as part of init.

## 4. Report

Compact list: created / already existed / skipped (with reason), plus the level decisions (present / accepted + seeded feature files awaiting approval / declined + how to enable later). Then: "Next: `/bdd <feature>`" (or continue the `/bdd` run that triggered init) — or, if seed feature files are awaiting approval, "Next: approve the seeded scenarios, then `/bdd`".

## What ends up in the project

```
specs/README.md                          feature-file layout + commands
docs/TESTING_PHILOSOPHY.md               rendered for this stack
.claude/bdd.config.json                  Claude config, when targeted
.agents/bdd.config.json                  Codex config, when targeted
.claude/hooks/{bdd-lib,bdd-gate,bdd-preflight,check-feature,check-test,bdd-parity}.mjs
.agents/hooks/{bdd-lib,bdd-gate,bdd-preflight,check-feature,check-test,bdd-parity}.mjs
.claude/rules/{bdd-gate,bdd-spec,bdd-test}.md   (Claude Code)
.claude/settings.json                    hooks block merged (Claude Code)
package.json                             "bdd:check" script
```

The skills themselves (`bdd`, `bdd-plan`, `bdd-implement`, `bdd-regression`) are installed by `dev-skills`; install them together.
