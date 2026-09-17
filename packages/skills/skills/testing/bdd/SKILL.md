---
name: bdd
description: Gated Behaviour-Driven Development for any new feature, business rule or bug fix — feature file → approval → tests → code → run. Also bootstraps a project (specs/, a stack-tailored docs/TESTING_PHILOSOPHY.md, lint + parity scripts) and runs regression fixes. Use whenever the user asks to build, add, change or implement behaviour, reports a bug, or says "/bdd", "bdd init", "bdd regression". Not for pure refactors with green tests.
---

# BDD

Behaviour drives code. Order is strict and each step is a gate:

**feature file → approval → tests → code → run**

Modes (pick from the request):

| Mode | Trigger | Section |
| --- | --- | --- |
| feature | build / add / change behaviour, `/bdd <feature>` | § Feature workflow |
| init | `specs/` or `docs/TESTING_PHILOSOPHY.md` missing, "set up BDD", `/bdd init` | § Init |
| regression | a bug, a wrong result, `/bdd regression` | § Regression |

Preflight for feature and regression: `specs/` **and** `docs/TESTING_PHILOSOPHY.md` must exist → otherwise run § Init first.

Paths below are relative to this skill's directory (`<skill>/scripts/…`, `<skill>/references/…`). After § Init the scripts also live in `.claude/hooks/` (Claude Code) and can be run from there.

---

## Feature workflow

Announce the phase at the start of each message (`[bdd 1/5 spec]`). Do not cross a gate early.

### 1/5 spec — describe the behaviour

1. Read the feature file(s) for the context (`specs/<context>/`) and `docs/TESTING_PHILOSOPHY.md` § 3 (levels, tags, decision tree) and § 7 (phrasing).
2. Clarify. Any rule you would have to guess → ask first, in one batched message (edge cases, error outcomes, limits, who can do it, what is visible after).
3. Write or update the `.feature` file. Per scenario: apply the decision tree → exactly one pyramid tag (`@unit` / `@integration` / `@e2e`), modifiers (`@regression`, `@unimplemented`) beside it. Titles are unique across `specs/` and are the binding key — keep them stable. Phrasing rules: `references/rules/bdd-spec.md`.
4. Lint and fix everything reported:
   ```bash
   node <skill>/scripts/check-feature.mjs specs/<context>/<file>.feature
   ```
5. Show the file (or diff) with a one-line summary per scenario and its level. Then **stop**:
   > Approve the scenarios to continue to tests, or tell me what to change.

**Gate 1**: explicit approval in chat ("ok", "approved", "go"). A question or a new requirement is not approval — loop back to 2.

### 2/5 tests — bind every scenario (Red)

No production files are touched in this phase.

1. Per tagged scenario pick the test file by level: `@unit` beside the unit, all collaborators faked via injection · `@integration` in the project's integration suite (real own code + in-process infra, external services stubbed) · `@e2e` in the browser suite (+ seed data). Follow the existing layout for each level.
2. Write tests per `references/rules/bdd-test.md`: JSDoc with one rule sentence + `@scenario "<title>"` byte-identical, no "should", nested given/when when ≥ 2 contexts, one invariant per test, minimal data, real own code.
3. Postponed scenarios → no `it.skip`; tag the scenario `@unimplemented` and say why. Binding a scenario that carries `@unimplemented` → remove the tag in the same change. A first `@e2e` binding that needs a runner or seed is a dependency change: ask first.
4. Lint, then run the touched scope; new tests must **fail for the right reason** (missing behaviour, not an import error):
   ```bash
   node <skill>/scripts/check-test.mjs <test files>
   node <skill>/scripts/bdd-parity.mjs
   ```
5. Report files created, bound count, failing titles. Continue to 3/5 unless asked to review tests first.

**Gate 2**: every tagged non-`@unimplemented` scenario bound, lint clean, tests red for the right reason.

### 3/5 code — minimum to go Green

Implement only what the approved scenarios require. Respect the project's architecture rules (layers, DI via abstract contracts, validation at boundaries). Run the touched scope after each unit of work. Two failed attempts on the same failing test → stop, report diagnosis + what was tried, ask.

**Gate 3**: all bound tests green; nothing weakened or deleted to get there.

### 4/5 run

```bash
node <skill>/scripts/bdd-parity.mjs
<project test command for the touched scope>   # unit + integration; e2e if a core flow changed
<project lint / typecheck>
```
All green, unused imports removed, nothing deferred.

### 5/5 refactor

With everything green: names, duplication, simplification. Behaviour and test intent unchanged. Re-run after each step. Skip if nothing to improve — say so.

### Report

```
[bdd done] <feature>
spec:   specs/<context>/<file>.feature  (+N scenarios: a @unit, b @integration, c @e2e; d @unimplemented)
tests:  <files>  (N bound)
code:   <files>
run:    <command> → pass (N tests) · lint ok · types ok · parity ok
```

### Never

Write a test or production line before gate 1 · write production code in phase 2 · bind two tests to one scenario or one test to two · rename a scenario without its binding · mock own code or module-mock internals · leave `@unimplemented` off a skipped scenario.

---

## Init

Idempotent: fills what is missing, reports what exists, never overwrites without asking.

### 1. Inspect

```bash
node <skill>/scripts/render-philosophy.mjs --detect
```

Prints `traits`, `lang` and `levels` (`present` / `applicable` / `suggested`).

| Trait | Detected from | Adds to the philosophy |
| --- | --- | --- |
| `frontend` | react / vue / svelte / angular / next / testing-library / jsdom | component + hook naming, UI/navigation branches, styling exclusion |
| `http-api` | fastify / express / koa / hono / nest / next | `METHOD /path` describe format, HTTP phrasing rows |
| `database` | drizzle / prisma / pg / mysql2 / typeorm / knex / mongoose | database row in doubles table |
| `e2e` | playwright / cypress / puppeteer / webdriverio | E2E level, `@e2e` tag, E2E environment section |
| `llm` | openai / anthropic / openrouter / ai / langchain / ollama | LLM row in doubles table |
| `observability` | langfuse / opentelemetry / sentry / pino / winston / axiom | tracing phrasing row |

Confirm with the user in **one** message: traits (add/remove), where tests live (`testGlobs`), and for every `suggested` level whether it is in scope. Non-JS projects: detection only picks the language; ask for traits and levels explicitly.

### 1b. Missing test levels — offer, never assume

| Level | Ask when | Reason to give |
| --- | --- | --- |
| `e2e` | frontend or http-api present, no e2e runner | "5–10 journeys through the real stack catch catastrophic regressions unit tests cannot" |
| `integration` | http-api / database / frontend present, no integration suite | "boundary contracts (routes, repositories, rendering) need real in-process infra, not mocks" |

- **Accepted** → keep the trait/tag; after step 2 seed feature files for it (2b). No test code now.
- **Declined `e2e`** → render the philosophy **without** the `e2e` trait and remove `"e2e"` from `pyramidTags` in `.claude/bdd.config.json` so `check-feature.mjs` rejects `@e2e`. Report how to enable later (add the trait, re-render, restore the tag).
- **Declined `integration`** → doc unchanged (the decision tree needs it); record the decision.
- Present levels are never asked about.

### 2. Create what is missing

- **`specs/README.md`** from `references/specs-README.md`. Layout is fixed: `specs/<context>/<behaviour>.feature`.
- **`docs/TESTING_PHILOSOPHY.md`**:
  ```bash
  node <skill>/scripts/render-philosophy.mjs --traits <comma,list> --lang <Language> --out docs/TESTING_PHILOSOPHY.md
  ```
  Omit flags to use detected values. The `e2e` trait means E2E **is in scope**; pass traits explicitly whenever a level was declined. If the file exists: render to a scratch path, show the diff, replace only on approval.
- **2b. Seed feature files** for each accepted level: `e2e` → the 5–10 stable core happy paths; `integration` → boundary contracts that exist today. One `.feature` per context, every scenario `@<level> @unimplemented`, phrased per § 7, linted. Show and **stop** for approval (gate 1). No tests, seeds, runner config or dependencies here.
- **`.claude/bdd.config.json`** from `references/bdd.config.default.json`; adjust `testGlobs`, `ignoreDirs`, `specsDir`. Drop `"e2e"` from `pyramidTags` if declined.
- **Scripts**: copy `scripts/{bdd-lib,bdd-gate,check-feature,check-test,bdd-parity}.mjs` → `.claude/hooks/`. Add `"bdd:check": "node .claude/hooks/bdd-parity.mjs"` to `package.json` scripts (CI gate).
- **Claude Code only** — hooks: merge `references/hooks.settings.json` into `.claude/settings.json` (`hooks` key; no duplicates, keep existing). Rules: copy `references/rules/bdd-*.md` → `.claude/rules/`. Codex has no hooks/rules: the scripts are run manually in phases 1, 2 and 4.
- **Project instructions**: `AGENTS.md` / `CLAUDE.md` must not `@`-include the full philosophy (≈4k tokens per session). One line: `- Workflow: BDD, gated. Run /bdd for features, /bdd regression for bugs. Rules: docs/TESTING_PHILOSOPHY.md.`

### 3. Verify

```bash
node .claude/hooks/bdd-parity.mjs
node .claude/hooks/check-feature.mjs
node .claude/hooks/check-test.mjs
```
All run without a crash. Parity gaps on an existing project are backlog: list them, do not fix them during init.

### 4. Report

Created / existed / skipped (with reason), level decisions (present / accepted + seeded files awaiting approval / declined + how to enable). Then "Next: `/bdd <feature>`" — or "approve the seeded scenarios, then `/bdd`".

---

## Regression

A bug is a rule the specs missed. Order: **scenario → failing test → fix → prove → run**.

1. **Pin the rule.** Restate as *given X, when Y, then Z (currently Z')*. Unclear expected behaviour → ask. Find the owning `specs/<context>/*.feature`; prefer editing an almost-right scenario over a near-duplicate. Pick the **lowest sufficient** level (unit > integration > e2e).
2. **Scenario.** `@regression` beside the pyramid tag. Lint with `check-feature.mjs`. Small bugs: state the scenario and continue; ambiguous or behaviour-changing bugs: stop and wait like gate 1.
3. **Failing test.** Bind it; run the touched scope; it must fail on current code for the bug's reason. Passes → the reproduction is wrong; fix the test first.
4. **Fix.** Minimum change, no surrounding refactor. Green.
5. **Prove.** Revert only the fix (keep the test), run → FAIL; restore, run → PASS. Report both result lines. Cannot fail with the fix reverted → back to 3.
   ```bash
   git stash push -- <fixed files>   # test stays
   <run the test>                    # expect FAIL
   git stash pop
   <run the test>                    # expect PASS
   ```
6. **Run + report.** Parity, tests, lint, typecheck. Suggest one commit: scenario + test + fix.

```
[regression done] <one-line bug>
scenario: specs/<context>/<file>.feature:<line>  @regression @<level>
test:     <file>:<line>  — fails on old code ✓, passes on fix ✓
fix:      <files>
run:      pass · lint ok · types ok · parity ok
```

---

## Scripts

| Script | Purpose | CLI | Claude Code hook |
| --- | --- | --- | --- |
| `check-feature.mjs` | exactly one pyramid tag, known tags, unique titles → errors; phrasing → warnings | `[files]` (none = all) | PostToolUse Write/Edit, `--hook` |
| `check-test.mjs` | no "should", `@scenario` matches a real scenario byte-for-byte, no double binding, no binding on `it.skip/todo` | `[files]` | PostToolUse Write/Edit, `--hook` |
| `bdd-parity.mjs` | tagged scenario ↔ bound test parity (`unbound` / `orphan` / `stale`); exit 1 on gaps | `[--json]` | Stop hook, `--hook` (blocks once, only for gaps in git-changed files) |
| `bdd-gate.mjs` | advisory reminder when production code is edited | — | PreToolUse Write/Edit, `--hook` |
| `render-philosophy.mjs` | detect stack traits / test levels; render the philosophy template | `--detect`, `--traits`, `--lang`, `--out` | — |

All scripts read `.claude/bdd.config.json` (`specsDir`, `testGlobs`, `ignoreDirs`, `pyramidTags`, `modifierTags`, `phrasingBanlist`) and fall back to defaults when it is missing. Zero dependencies, Node ≥ 18.
