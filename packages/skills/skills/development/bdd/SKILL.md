---
name: bdd
description: Gated BDD workflow for any new feature, function or business rule — interview → feature file → approval → tests → code → run → refactor. Use whenever the user asks to build, add, change or implement behaviour (even small), or says "/bdd". Also use when the user says "set up BDD", "init BDD" or "bdd init" (harness bootstrap lives in references/init.md). Not for bug fixes (use /bdd-regression) or pure refactors with green tests.
---

# /bdd — interview → feature file → approval → tests → code → run

Each phase ends at a gate. Do not cross a gate early. Announce the phase you are in at the start of each message (`[bdd 1/5 spec]`).

Preflight: `specs/` and `docs/TESTING_PHILOSOPHY.md` must exist → otherwise initialize the harness first following [references/init.md](references/init.md). Init has its own gate (the user confirms the detected stack before any file is written) — that question **ends the message**. Do not start `[bdd 1/5 spec]` until init has reported what it created; resume here in a later turn.

**Test levels are per project, not fixed.** The levels this skill may use are `pyramidTags` in `.claude/bdd.config.json` (set during init to match what the project actually has). A project without E2E has no `e2e` tag; a project with only unit tests has only `unit`. Tag scenarios, pick test locations and run commands only for those levels. Never introduce a level the project lacks — if a scenario truly needs one, tag it with the nearest available level and note the gap in the report, or ask the user whether to add the level (that is a harness change, not part of this run).

## 1/5 spec — describe the behaviour

1. Orient before exploring. Read `.claude/bdd.config.json` — `testGlobs` tells you where the code lives. Then read the existing feature file(s) for the context (`specs/<context>/`) and `docs/TESTING_PHILOSOPHY.md` § 3 (levels, tags, decision tree) and § 7 (phrasing) if not already in context.

   When looking for code: **never assume a path**. Derive roots from `testGlobs`, then locate with a search (`grep -rl`, glob, or the agent's search tool) instead of `ls`/`find` on a guessed directory. Do not chain several guessed paths in one shell command — one wrong path fails the whole command and buries the output; probe one path at a time or search.
2. Activate "Interview Mode" with the user before writing anything. Interview the user relentlessly until you reach a shared understanding. Goal: no rule in the feature file is a guess. Scale it to the ask — a small, unambiguous change may need one round or none (say so and move on); a vague ask gets the full treatment below.

   Map the requirements as a **design tree**: every decision branches into the decisions that hang off it. Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round, then wait for the user's answers before the next round. Typical unknowns: edge cases, error outcomes, limits, who can do it, what is visible after.

   **How to ask.** Every question is multiple choice: 2–4 concrete options, each a real alternative with a short consequence, and exactly one marked as recommended. Never a bare open question — a choice with a recommendation is faster to answer and harder to misread.

   - **Agent has a structured question tool** (Claude Code: `AskUserQuestion`, Codex: `request_user_input`) → **use it**; do not write the questions as chat text. One tool call per round, up to 4 questions per call (more → consecutive calls in the same round). Per question: `header` = 2–3 word topic, `question` = the full question, `options` = the choices with a one-line `description` each; put the recommended option **first** and suffix its label with ` (Recommended)`. Independent choices → `multiSelect: true`. The tool adds "Other" itself.
   - **No such tool** (Codex, plain chat) → same content in text:

     ```
     ❓ **Q1 — <topic>**: <question>
        (a) <option> (Recommended) — <consequence>
        (b) <option> — <consequence>
        (c) <option> — <consequence>

     ❓ **Q2 — <topic>**: …
     ```

   Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

   Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, existing code, config), look it up yourself (sub-agent if available); don't ask the user for anything you could find. Don't block on it: only the questions downstream of that lookup wait; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

   The interview is done when the frontier is empty: every branch visited, nothing left silently assumed. Do not write the feature file until the user confirms you have reached a shared understanding.

3. Write or update the `.feature` file. Per scenario: apply the decision tree → exactly one pyramid tag (`@unit` / `@integration` / `@e2e`), modifiers beside it. Titles are unique across `specs/` and are the binding key — keep them stable.
4. Report what changed so the user can review it, then **stop**:

   ```
   [BDD 1/5 spec] ready for review
   added:     specs/<context>/<file>.feature
   modified:  specs/<context>/<other>.feature   (+2 scenarios, 1 retitled)
   scenarios:
     - <title>  @unit
     - <title>  @integration
     - <title>  @e2e
   ```

   List every file added or modified in this phase with its path. For a modified file, show the diff (or say what changed per scenario). Run `node .claude/hooks/check-feature.mjs <file>` on each file and include its output in the report — **do not fix anything at this stage**; the user decides at the gate. Then ask:

   > Review the file(s) above. Approve the scenarios to continue to tests, or tell me what to change.

**Gate 1**: explicit approval in chat. "ok", "approved", "go" count. Silence, a question, or a new requirement do not — loop back to step 2.

## 2/5 tests — bind every scenario (Red)

Preconditions: gate 1 passed. No production files are touched in this phase.

1. For each tagged scenario, decide the test file by level (only levels in `pyramidTags` apply — skip the rows below the project does not have):
   - `@unit` → beside the unit (`<name>.test.ts`), all collaborators faked via injection.
   - `@integration` → the project's integration suite (real own code + in-process infra; external services stubbed).
   - `@e2e` → the browser suite; also update the E2E seed if data is needed.
   Follow the project's existing layout for each level (look at neighbouring tests before creating a new location).
2. Write the tests following `.claude/rules/bdd-test.md`: JSDoc with rule sentence + `@scenario "<title>"` byte-identical, no "should", nested given/when when ≥2 contexts, one invariant per test, minimal data, real own code.
3. Scenarios you deliberately postpone → no `it.skip`; tag the scenario `@unimplemented` and say why. Binding a scenario that carries `@unimplemented` (e.g. seeded during init) → remove the tag in the same change. A first `@e2e` binding may need a runner or seed that does not exist yet — that is a dependency/config change: ask before adding it.
4. Lint, then run the touched scope and confirm the new tests **fail for the right reason** (missing behaviour, not a typo/import error):
   ```bash
   node .claude/hooks/check-test.mjs <test files>
   node .claude/hooks/bdd-parity.mjs
   ```
5. Report: files created, count of bound scenarios, the failing test titles. Then continue to 3/5 without waiting unless the user asked to review tests first.

**Gate 2**: every tagged non-`@unimplemented` scenario is bound, lint clean, tests red for the right reason.

## 3/5 code — minimum to go Green

1. Implement only what the approved scenarios require. No extra behaviour, no speculative options, no "while I'm here".
2. Respect the project's architecture rules (layers, DI via abstract contracts so unit tests inject fakes, validation at boundaries).
3. Run the touched scope after each unit of work. Fix failures you caused before moving on.
4. Two failed attempts on the same failing test → stop, report diagnosis + what was tried, ask.

**Gate 3**: all bound tests green; no test was weakened or deleted to get there.

## 4/5 run — full verification for the touched scope

```bash
node .claude/hooks/bdd-parity.mjs
<project test command for touched packages>   # every level in pyramidTags that has a suite; e2e only if present and a core flow changed
<project lint / typecheck>
```
All green. Remove unused imports. Nothing deferred.

## 5/5 refactor — structure only

With everything green: improve names, extract duplication, simplify. Behaviour unchanged, tests unchanged in intent. Re-run tests after each refactor step. Skip if nothing to improve — say so.

## Report (final message)

```
[BDD done] <feature>
spec:   specs/<context>/<file>.feature  (+N scenarios: a @unit, b @integration, c @e2e; d @unimplemented)
tests:  <files>  (N bound)
code:   <files>
run:    <command> → pass (N tests) · lint ok · types ok · parity ok
```

The working tree is left as is: **no `git add`, no commit, no stash**. End with: "Changes are unstaged — review and commit when ready."

## Never

- Write a test or production line before gate 1.
- Write production code in phase 2.
- Bind two tests to one scenario, or one test to two.
- Rename a scenario without updating its binding in the same change.
- Mock own code; module-mock internals.
- Leave `@unimplemented` off a scenario you skipped.
- Run `git add`, `git commit`, `git stash` or any other command that changes git state, at any phase — unless the user asks for it.
