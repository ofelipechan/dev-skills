# Specs

Gherkin feature files describing user-facing behaviour. They are the requirements: if it is not in a feature file, it is not in scope.

Workflow, test levels, tags, and the `@scenario` binding syntax live in `docs/TESTING_PHILOSOPHY.md` (§ 6, § 3, § 7). This file holds only **where files live**.

## Layout

- Path: `specs/<context>/<behaviour>.feature`.
- A context mirrors a service cluster and may hold several files.
- File names are kebab-case and name the behaviour.
- Free-text under `Feature:` lists constraints and what superseded what.
- No file for your area yet? Write it first — `docs/TESTING_PHILOSOPHY.md` § 6.

## Commands

```bash
# spec <-> test parity (also the CI gate)
node .claude/hooks/bdd-parity.mjs

# lint all feature files (tags, phrasing)
node .claude/hooks/check-feature.mjs

# lint all test files (bindings, naming)
node .claude/hooks/check-test.mjs
```
