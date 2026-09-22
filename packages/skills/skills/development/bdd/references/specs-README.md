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
npm run bdd:check

# Claude Code: lint all feature and test files
node .claude/hooks/check-feature.mjs
node .claude/hooks/check-test.mjs

# Codex: lint all feature and test files
node .agents/hooks/check-feature.mjs
node .agents/hooks/check-test.mjs
```

Use the commands for an agent initialized in this project.
