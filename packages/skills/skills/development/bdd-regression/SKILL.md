---
name: bdd-regression
description: Bug-fix workflow — reproduce with a failing @regression scenario + test at the lowest sufficient level, then fix, then prove the test fails with the fix reverted. Use when the user reports a bug, a wrong result, an error in production, or says "/bdd-regression". Not for new behaviour (use /bdd).
---

# /bdd-regression — reproduce → fix → prove

A bug is a rule the specs missed. The fix ships with the scenario that would have caught it. Order: **scenario → failing test → fix → prove → run**.

## 1. Pin the rule

1. Restate the bug as a rule for the user: *given X, when Y, then Z (currently Z')*. If the expected behaviour is unclear or contested, ask — do not guess.
2. Locate the context: which `specs/<context>/*.feature` owns this behaviour? Read it. Often an existing scenario is *almost* right (wrong step, missing edge) — prefer editing it over adding a near-duplicate.
3. Pick the level with the decision tree (`docs/TESTING_PHILOSOPHY.md` § 3): **lowest sufficient** — unit if the wrong branch is pure logic, integration if it needs infra/rendering, e2e only if nothing lower can reproduce it.

## 2. Scenario

Add or edit the scenario with `@regression` **beside** its pyramid tag:

```gherkin
@regression @unit
Scenario: <observable rule that the bug violated>
  Given …
  When …
  Then …
```

Lint: `node .claude/hooks/check-feature.mjs <file>`. Show it. Small bugs: continue without a formal approval stop, but state the scenario in the message so the user can object. Ambiguous or behaviour-changing bugs: **stop and wait** like `/bdd` gate 1.

## 3. Failing test

Bind it (`@scenario "<title>"`, rules in `.claude/rules/bdd-test.md`). Run the touched scope. The test must **fail on the current code for the bug's reason** — if it passes, the reproduction is wrong; fix the test before touching production code.

## 4. Fix

Minimum change that makes the test green. No surrounding refactor in the same step. Run the touched scope: green.

## 5. Prove

Revert only the fix (keep the test), run the test, confirm it fails, restore the fix, run again, confirm it passes. In git terms:

```bash
git stash push -- <fixed files>     # test stays
<run the test>                      # expect FAIL
git stash pop
<run the test>                      # expect PASS
```

Report both outputs (titles + result lines are enough). If the test cannot fail with the fix reverted, it does not guard the bug — go back to 3.

## 6. Run + report

```bash
node .claude/hooks/bdd-parity.mjs
<project tests for the touched scope> ; <lint> ; <typecheck>
```

```
[regression done] <one-line bug>
scenario: specs/<context>/<file>.feature:<line>  @regression @<level>
test:     <file>:<line>  — fails on old code ✓, passes on fix ✓
fix:      <files>
run:      pass · lint ok · types ok · parity ok
```

Suggest the commit as one logical unit: scenario + test + fix.
