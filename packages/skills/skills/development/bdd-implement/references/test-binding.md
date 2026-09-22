# Bind-tests contract

Use after the user approves the feature scenarios. This contract is identical whether the main agent executes it or delegates it to one subagent.

## Inputs

Provide or locate:

- approved feature-file paths and exact scenario titles;
- the current agent's `bdd.config.json`;
- `docs/TESTING_PHILOSOPHY.md` sections 3 and 7;
- neighboring tests and the commands that run their scope.

Project instructions remain active. If this contract conflicts with them, stop and report the conflict to the parent.

## Scope

Change test files and the approved feature files only. Production code remains untouched. Return a blocker instead of adding a dependency, runner, or test level without user approval.

For every approved scenario:

1. Choose the lowest configured level that can prove the behavior:
   - `@unit` → beside the unit, with external collaborators injected as fakes.
   - `@integration` → the existing integration suite, using real own code and in-process infrastructure.
   - `@e2e` → the existing end-to-end suite; update existing seed data when required.
2. Follow neighboring test structure and the installed BDD test rule. Bind exactly one test with a JSDoc `@scenario "<title>"` matching the scenario byte-for-byte.
3. Keep each test focused on one observable invariant and use minimal data.
4. Leave `@unimplemented` in place while binding; implementation removes it once the test is green. When a scenario must remain deferred, keep it unbound, keep (or add) `@unimplemented`, and report why.
5. Run:

   ```bash
   node <bdd skill dir>/scripts/check-test.mjs <changed test files>
   node <bdd skill dir>/scripts/bdd-parity.mjs
   <focused test command>
   ```

The focused tests must be red because production behavior is missing, not because of imports, syntax, setup, or infrastructure.

## Return contract

Return only:

```text
status: RED | BLOCKED
bindings:
  - <scenario> -> <test file>:<line>
changed: <test and feature files>
commands: <validators and focused test command>
failures: <test title -> missing behavior>
blocker: <required decision or infrastructure, when blocked>
```

The parent proceeds to implementation only on `RED` with complete bindings and clean validators.
