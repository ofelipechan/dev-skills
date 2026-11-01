---
paths:
  - "specs/**/*.feature"
---

# Feature files (specs/)

Extract of `docs/TESTING_PHILOSOPHY.md` § 3, § 7, § 8. Hook `check-feature.mjs` enforces tags; phrasing violations come back as warnings — fix them.

## Layout
- `specs/<context>/<behaviour>.feature`; context = service cluster; kebab-case file names.
- Free text under `Feature:` lists constraints and what superseded what.

## What earns a scenario
Behaviour someone depends on: state created/changed/removed (incl. defaults), computed or derived results (overdue, expired), who may do or see what (incl. redaction), status transitions and time triggers, validation rules, which records a list includes/excludes/ranks first by rule, what a message or document must tell its reader, repeated or simultaneous actions, side effects others observe. Litmus: would changing it need a product or business decision? Only a design or copy decision → no scenario (§ 8: styling, copy, layout, display formatting, generic component mechanics, navigation chrome); give it a unit test with no scenario and no `@scenario` binding when it has real branches. Unsure → ask. Judge the purpose, not the form: show/hide, enable/disable, ordering and formatting count only when they enforce a rule; reshape a presentation-sounding scenario around its purpose instead of deleting it.

## Tags — exactly one pyramid tag per scenario
| Tag | Use when |
| --- | --- |
| `@unit` | pure logic, branches, transformations |
| `@integration` | boundary contracts, error handling, edge cases, UI elements or routes a rule requires, full workflow of a new/changing feature |
| `@e2e` | one of the 5–10 stable core happy paths (only if not already covered) |

Modifiers sit beside the pyramid tag, never instead of it: `@regression` (guards a fixed bug), `@unimplemented` (rule asserted, production behavior not yet delivered — every new scenario starts with it; removed only when its bound test is green, or with the scenario's deletion).

Decision tree, in order, stop at first match: stable core happy path → `@e2e` · UI elements or routes a rule requires / error handling / edge cases / new-feature workflow → `@integration` · pure logic → `@unit` · production regression → lowest sufficient level + `@regression`.

## Phrasing — behaviour for the person using the system
No functions, classes, modules, test doubles, HTTP verbs, paths, status codes, attribute names, literal URLs. Concrete domain values stay (a score of 4, 2 entries, the admin email); the transport goes.

| Avoid | Prefer |
| --- | --- |
| `Then quizService.create() is called once` | `Then a quiz is created and no option reveals whether it is correct` |
| `Then it throws NotFoundError` | `Then the request is rejected as not found` |
| `Given the repository mock returns null` | `Given the id does not exist, nothing is resolved` |
| `When the client GETs /api/users` | `When the client requests the list of users` |
| `Then the response is 401` | `Then the request is rejected as unauthenticated` |
| `Given the Authorization header carries a valid JWT` | `Given the user is signed in with a valid session` |
| `Given fetch resolves with status 500` | `Given the source document cannot be retrieved` |
| `Then the <Button> has the disabled attribute` | `Then the submit button cannot be pressed while sending` |

## Binding contract
Scenario titles are the key: each tagged scenario is bound by exactly one test via `@scenario "<title>"` (byte-identical). Renaming a scenario edits spec and test in one commit. Duplicate titles across files are errors.
