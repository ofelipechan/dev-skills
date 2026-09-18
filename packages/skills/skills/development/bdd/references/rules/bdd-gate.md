# BDD gate (always on)

Behaviour drives code. Order is strict and each step is a gate:

**interview → feature file → approval → tests → code → run**

- Any new feature, function, business rule or bug fix starts with `/bdd` (bug: `/bdd-regression`). Do not write tests or production code directly.
- Before writing or updating a `.feature` file in `specs/`: interview the user until no rule is a guess.
- After writing or updating a `.feature` file in `specs/`: list the files added/modified (with lint output, unfixed), share them and **stop**. No test files, no production code until the user explicitly approves the scenarios.
- Never write tests and implementation in the same step. Never implement first and backfill tests or scenarios.
- If a rule is unclear, ask — never write a scenario on a guess.
- `specs/` or `docs/TESTING_PHILOSOPHY.md` missing → run `/bdd` and initialize the harness first (`references/init.md` in the `bdd` skill).
- Never stage or commit (`git add` / `git commit` / `git stash`) as part of `/bdd` or `/bdd-regression`. Leave the working tree unstaged for the user to review.
- Full rules: `docs/TESTING_PHILOSOPHY.md`. Path-scoped extracts load automatically when editing `specs/**` or test files.
