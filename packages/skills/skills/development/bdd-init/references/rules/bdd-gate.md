# BDD gate (always on)

Behaviour drives code. Order is strict and each step is a gate:

**feature file → approval → tests → code → run**

- Any new feature, function, business rule or bug fix starts with `/bdd` (bug: `/bdd-regression`). Do not write tests or production code directly.
- After writing or updating a `.feature` file in `specs/`: share it and **stop**. No test files, no production code until the user explicitly approves the scenarios.
- Never write tests and implementation in the same step. Never implement first and backfill tests or scenarios.
- If a rule is unclear, ask — never write a scenario on a guess.
- `specs/` or `docs/TESTING_PHILOSOPHY.md` missing → run `/bdd-init` first.
- Full rules: `docs/TESTING_PHILOSOPHY.md`. Path-scoped extracts load automatically when editing `specs/**` or test files.
