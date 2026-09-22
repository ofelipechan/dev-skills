# BDD gate (always on)

Behaviour drives code. Order is strict and each step is a gate:

**discovery → feature file → approval → tests → code → verification**

- Any new feature, function, business rule or bug fix starts with `/bdd` (bug: `/bdd-regression`). Do not write tests or production code directly.
- Before writing or updating a `.feature` file in `specs/`: interview the user until no rule is a guess.
- After writing or updating a `.feature` file in `specs/`: fix validator findings, list the files and scenarios with validation output, share them and **stop**. Test and production work starts only after explicit approval.
- Never write tests and implementation in the same step. Never implement first and backfill tests or scenarios.
- If a rule is unclear, ask — never write a scenario on a guess.
- Run the BDD preflight before Discovery. An `incomplete` or `invalid` result routes to harness initialization.
- Never stage or commit (`git add` / `git commit` / `git stash`) as part of `/bdd` or `/bdd-regression`. Leave the working tree unstaged for the user to review.
- Full rules: `docs/TESTING_PHILOSOPHY.md`. Path-scoped extracts load automatically when editing `specs/**` or test files.
