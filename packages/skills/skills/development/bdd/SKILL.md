---
name: bdd
description: Gated BDD workflow for any new feature, function or business rule — feature file → approval → tests → code → run → refactor. Use whenever the user asks to build, add, change or implement behaviour (even small), or says "/bdd". Not for bug fixes (use /bdd-regression) or pure refactors with green tests.
---

# /bdd — feature file → approval → tests → code → run

Each phase ends at a gate. Do not cross a gate early. Announce the phase you are in at the start of each message (`[bdd 1/5 spec]`).

Preflight: `specs/` and `docs/TESTING_PHILOSOPHY.md` must exist → otherwise run `/bdd-init` first.

## 1/5 spec — describe the behaviour

1. Read the existing feature file(s) for the context (`specs/<context>/`). Read `docs/TESTING_PHILOSOPHY.md` § 3 (levels, tags, decision tree) and § 7 (phrasing) if not already in context.
2. Clarify. Any rule you would have to guess → ask first, in one batched message. Typical unknowns: edge cases, error outcomes, limits, who can do it, what is visible after. For a vague ask, use the `grill-me` skill's interview format.
3. Write or update the `.feature` file. Per scenario: apply the decision tree → exactly one pyramid tag (`@unit` / `@integration` / `@e2e`), modifiers beside it. Titles are unique across `specs/` and are the binding key — keep them stable.
4. Run the lint and fix everything it reports:
   ```bash
   node .claude/hooks/check-feature.mjs specs/<context>/<file>.feature
   ```
5. Show the file (or the diff for an update) and a one-line summary per scenario with its level. Then **stop**:

   > Approve the scenarios to continue to tests, or tell me what to change.

**Gate 1**: explicit approval in chat. "ok", "approved", "go" count. Silence, a question, or a new requirement do not — loop back to step 2.

## 2/5 tests — bind every scenario (Red)

Preconditions: gate 1 passed. No production files are touched in this phase.

1. For each tagged scenario, decide the test file by level:
   - `@unit` → beside the unit (`<name>.test.ts`), all collaborators faked via injection.
   - `@integration` → the project's integration suite (real own code + in-process infra; external services stubbed).
   - `@e2e` → the browser suite; also update the E2E seed if data is needed.
   Follow the project's existing layout for each level (look at neighbouring tests before creating a new location).
2. Write the tests following `.claude/rules/bdd-test.md`: JSDoc with rule sentence + `@scenario "<title>"` byte-identical, no "should", nested given/when when ≥2 contexts, one invariant per test, minimal data, real own code.
3. Scenarios you deliberately postpone → no `it.skip`; tag the scenario `@unimplemented` and say why. Binding a scenario that carries `@unimplemented` (e.g. seeded by `/bdd-init`) → remove the tag in the same change. A first `@e2e` binding may need a runner or seed that does not exist yet — that is a dependency/config change: ask before adding it.
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
<project test command for touched packages>   # unit + integration; e2e if a core flow changed
<project lint / typecheck>
```
All green. Remove unused imports. Nothing deferred.

## 5/5 refactor — structure only

With everything green: improve names, extract duplication, simplify. Behaviour unchanged, tests unchanged in intent. Re-run tests after each refactor step. Skip if nothing to improve — say so.

## Report (final message)

```
[bdd done] <feature>
spec:   specs/<context>/<file>.feature  (+N scenarios: a @unit, b @integration, c @e2e; d @unimplemented)
tests:  <files>  (N bound)
code:   <files>
run:    <command> → pass (N tests) · lint ok · types ok · parity ok
```

## Never

- Write a test or production line before gate 1.
- Write production code in phase 2.
- Bind two tests to one scenario, or one test to two.
- Rename a scenario without updating its binding in the same change.
- Mock own code; module-mock internals.
- Leave `@unimplemented` off a scenario you skipped.
