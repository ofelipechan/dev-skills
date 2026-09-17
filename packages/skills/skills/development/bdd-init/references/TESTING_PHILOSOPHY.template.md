<!--
  TEMPLATE for docs/TESTING_PHILOSOPHY.md — rendered by the /bdd-init skill.

  Markers (all removed from the rendered output):
    <!-- IF:<trait> --> ... <!-- ENDIF:<trait> -->   keep block only when the project has <trait>
    ... <!-- only:<trait> -->                         keep this single line only when the project has <trait>
    {{EXAMPLE_LANGUAGE}}                              replaced with the project's main language

  Traits: frontend, http-api, database, e2e, llm, observability.
  Detection rules live in bdd-init/SKILL.md (scripts/render-philosophy.mjs --detect).
-->
# Testing Philosophy

This document holds the reasoning and the rules for how we test, including scenario tags and the `@scenario` binding syntax. `specs/README.md` holds only the feature-file layout.

The document is intentionally stack-agnostic. Examples use {{EXAMPLE_LANGUAGE}}, but every principle applies to any language or runner.

---

## 1. Core Principles

### Tests are the specification

A test encodes a business rule. If the rule is unclear, **ask before writing the test** — do not guess. A test that guesses locks in a wrong behaviour and makes it expensive to fix later.

### Test behaviour, not implementation

Focus on **what** the code does, not **how**. A test should survive a refactor that keeps behaviour identical.

| Avoid | Prefer |
| --- | --- |
| asserting a collaborator was called with specific args | asserting the observable outcome |
| asserting internal state | asserting the returned value / rendered output / persisted row |

Wording rules for scenarios and test titles: § 7 "Phrasing".

### Every test documents the rule it protects

Each test carries a short JSDoc (or equivalent doc comment) that states the **goal** — the behaviour or rule being validated — and the `@scenario` it binds (§ 7). A reader should understand the rule without reading the body.

```ts
/**
 * An expired session cannot be used to access protected resources.
 * @scenario "a user with an expired session is asked to sign in again"
 */
it("rejects the request when the session token has expired", () => { /* ... */ });
```

- The doc comment explains **behaviour**.
- The `it()` title explains **how the test proves it**.

### Naming

**No "should"** in test names. Present tense, active voice, describe the outcome directly.

| Avoid | Prefer |
| --- | --- |
| `it("should sign in a user")` | `it("signs in a user")` |
| `it("should redirect guests")` | `it("redirects guest users")` |

`describe` names the unit under test, MDN-style:

| Type | Format | Example |
| --- | --- | --- |
| Function | `name()` | `describe("hashPassword()")` |
| Class / service | `Name` | `describe("AuthService")` |
| Component | `<Name/>` | `describe("<LoginForm/>")` | <!-- only:frontend -->
| Hook | `useName()` | `describe("useSession()")` | <!-- only:frontend -->
| Route / endpoint | `METHOD /path` | `describe("POST /api/auth/login")` | <!-- only:http-api -->

Keep names short.

### BDD-Style Test Structure

Use nested `describe` blocks to express Given/When/Then structure.

```ts
describe("AuthService", () => {
  describe("login()", () => {
    describe("given an unknown email", () => {
      beforeEach(() => { /* arrange */ });

      describe("when login is attempted", () => {
        /**
         * Unknown accounts cannot sign in.
         * @scenario "signing in with an unknown email is rejected"
         */
        it("rejects the credentials", () => { /* assert */ });
      });
    });

    describe("given a valid email and password", () => {
      describe("when login is attempted", () => {
        /**
         * A successful sign-in starts a session for that user.
         * @scenario "signing in with valid credentials starts a session"
         */
        it("issues a session token for the user", () => { /* assert */ });
      });
    });
  });
});
```

Benefits:
- **Grouping**: related tests share setup in `beforeEach`
- **Readability**: output reads like a spec: "ClassName > methodName > given X > when Y > does Z"
- **Organization**: context (given) is separated from action (when) and expectation (it)

Rules:
- Avoid flat tests that encode Given/When/Then only in comments — comments give no grouping, no shared setup, and no structured output.
- Use nesting when there are ≥2 contexts. A unit with one context needs no inner `describe`.

See [bettertests.js.org](https://bettertests.js.org/) for more patterns.

### One invariant per test

One test proves one rule. Multiple `expect` calls are fine when they describe the *same* invariant (e.g. two fields of one returned object). They are not fine when they cover independent rules — a failure then tells you nothing about which rule broke.

Rule of thumb: if two assertions could fail independently for different reasons, split the test. A long test name is the usual symptom.

---

## 2. Coverage Is Mandatory

Every change ships with tests. No exceptions.

- **New features**: every tagged scenario in the feature file has a test (§ 7).
- **Bug fixes**: a `@regression` test (§ 9).
- **Refactors**: no reduction in existing coverage.

**Minimum coverage**: 80 % lines overall, 90 % for core business logic (services, domain rules, authentication, authorization, pricing logic — whatever the product's correctness depends on).

Coverage is a floor, not a target. 100 % coverage with mock-heavy tests is worse than 85 % with behaviour tests.

---

## 3. Test Hierarchy

Each level has a distinct purpose. **Do not prove the same rule at two levels.**

| Level | Purpose | What is real | What is faked | Quantity |
| --- | --- | --- | --- | --- |
| **E2E** | catastrophic regression detection on stable core flows | everything (browser, server, disposable seeded DB) | third-party services only | 5–10 total | <!-- only:e2e -->
| **Integration** | edge cases, error handling, rendering, boundary contracts | own code + in-process infrastructure (test DB, HTTP injection, DOM) | external services only | as many as needed |
| **Unit** | pure logic and branches | the unit under test | all collaborators | as many as needed |

What "faked" means in practice: § 4.

### Tags

Every scenario in a feature file carries **exactly one** pyramid tag naming the level that owns it. An untagged scenario enforces nothing and is decorative.

| Pyramid tag | Use when |
| --- | --- |
| `@unit` | pure logic, branches, transformations |
| `@integration` | rendering, boundary contracts, error handling, edge cases |
| `@e2e` | one of the 5–10 stable core happy paths | <!-- only:e2e -->

Modifiers sit **beside** the pyramid tag, never instead of it:

| Modifier | Meaning |
| --- | --- |
| `@regression` | guards a previously fixed bug (§ 9) |
| `@unimplemented` | rule asserted, test not yet written — a tracked promise, removed only with a binding or with the scenario's deletion |

```gherkin
@regression @integration
Scenario: a user with an expired session is asked to sign in again
  Given a user whose session expired an hour ago
  When they open a protected page
  Then they are asked to sign in again
```

### Decision tree

Apply in order; stop at first match.

```text
<!-- IF:e2e -->
Is this a core happy path of a stable, established feature?
  -> @e2e (only if not already covered by the stable suite)
<!-- ENDIF:e2e -->

<!-- IF:frontend -->
Is this testing UI elements exist? (form fields, buttons, layout)
  -> @integration

Is this testing navigation/routing only?
  -> @integration
<!-- ENDIF:frontend -->

Is this testing error handling or edge cases?
  -> @integration

Is this a complete user workflow for a new/changing feature?
  -> @integration

Is this pure logic in isolation?
  -> @unit

Is this a regression from production?
  -> lowest sufficient level (unit > integration<!-- IF:e2e --> > e2e<!-- ENDIF:e2e -->), see § 9
```

<!-- IF:e2e -->
#### E2E environment

The E2E suite never touches the development or production database. It spins up its own:

1. **Spawn** a temporary database container via `docker compose` (a dedicated compose service / profile) bound to a **different port** than the dev database, so both can run side by side.
2. **Migrate** the schema against it.
3. **Seed** it with a fixed, synthetic dataset (the E2E seed) — known users, known entities, known credentials. Same rules as § 5.
4. **Point** the server under test at that database (e.g. via a `DATABASE_URL` override in the E2E config / env file).
5. **Run** the browser suite.
6. **Tear down** the container after the run (`docker compose down -v` for the E2E service) so every run starts from the same seed.

Rules:

- The seed is **part of the suite**, versioned with the tests. A scenario that needs new data changes the seed, not the dev DB.
- Tests assume the seed and **never depend on state left by another test**. If a test mutates data other tests read, it restores it or the suite reseeds between spec files.
- Ports, credentials and database name for the E2E instance live in the compose file / E2E env — never hardcoded in tests.
- External third-party services (LLMs, payment providers, email) are still stubbed or pointed at sandbox endpoints; "nothing faked" applies to **our own** stack.
<!-- ENDIF:e2e -->

---

## 4. Test Doubles

**Prefer real implementations. Fake only at external boundaries.**

Mocks assert *how* code collaborates — they couple tests to implementation. When internals are refactored, mock-heavy tests break while behaviour is unchanged.

| Dependency | Approach |
| --- | --- |
| Own code (services, helpers, mappers) | use the real thing |
| Database | real test database in integration tests; injected fake repository in unit tests | <!-- only:database -->
| HTTP APIs, third-party SDKs | stub at the network / SDK boundary |
| LLMs and other non-deterministic services | stub with a fixed, minimal response; never call the real model in the suite | <!-- only:llm -->
| File system | in-memory or temp directory |
| Time, randomness, IDs | inject or fake; tests must be deterministic |
| Environment variables | set explicitly in the test; never rely on the developer's machine |

Rules:

- **Never mock your own code** to make a unit "easier" to test. If a unit is hard to test, its dependencies are wrong — inject them.
- Depend on **interfaces / abstract contracts**, not concrete classes, so a fake can be injected without a module-level mock.
- Module-level mocking (`vi.mock`, `jest.mock`, monkey-patching) is a last resort for third-party boundaries, never for internal modules.
- A double returns the minimum shape the test needs (§ 5).

---

## 5. Test Data

**Create minimal, context-specific, deterministic data.**

Only generate data needed for the specific test. Comprehensive setup obscures what's actually being tested. Never use real personal data.

```ts
// Avoid: everything, most of it irrelevant
const user = createFullUser({ name, email, address, preferences, history, ... });

// Prefer: what the rule needs
const user = { id: "u1", role: "guest" };
```

---

## 6. Workflow (BDD, outside-in)

Behaviour drives everything. The feature file is written first, approved, and only then turned into tests and code. Each step is a gate — do not move to the next until the current one is complete.

1. **Describe the behaviour.** Write or update the `.feature` file in `specs/` (layout: `specs/README.md`; phrasing: § 7). Scenarios *are* the acceptance criteria. If any rule is unclear, ask — do not write a scenario on a guess.
2. **Wait for approval.** Share the feature file. **Stop.** No test files, no production code until the scenarios are explicitly approved. Reviewer (human or agent) challenges missing edge cases here — it is far cheaper to fix a scenario than a test or an implementation.
3. **Write the tests.** On approval, write the test files that bind every tagged scenario (§ 7), at the level the decision tree assigns (§ 3). Tests fail at this point — that is expected (Red). Do not touch production code yet.
4. **Write the production code.** Only after all test files exist, implement the minimum code that makes them pass (Green). No extra behaviour beyond the approved scenarios.
5. **Run the tests.** Unit + integration for the touched scope<!-- IF:e2e -->; E2E when a core flow was touched<!-- ENDIF:e2e -->. Everything green before the work is considered done. Fix failures you caused before continuing — **no deferred test fixes**.
6. **Refactor.** Improve structure with all tests green. Behaviour unchanged, tests unchanged in intent. Re-run tests after every refactor step.

Order is strict: **feature file → approval → tests → code → run**. Never write tests and implementation in the same step. Never write implementation first and "backfill" tests or scenarios.

After two failed attempts at the same failing test, stop guessing — report the diagnosis and what was tried.

---

## 7. Feature-File Parity

Feature specs define which tests must exist. **Every tagged scenario has a corresponding test.** This is enforced, not aspirational.

### Binding syntax

A `@scenario "<title>"` line in the doc comment directly above the `it(...)` / `test(...)` binds the test to the scenario (example in § 1). Title **byte-identical** to the `Scenario:` line.

- One scenario ↔ one test.
- `it.each` takes one annotation above the call.
- `it.skip` / `it.todo` carry no annotation — tag the scenario `@unimplemented` instead (§ 3).
- Renaming a scenario edits spec and test in one commit.
- What is listed in § 8 gets no scenario and no annotation.

### Phrasing

Scenarios — and the `it()` titles bound to them — describe behaviour for the person using the system. No functions, classes, modules, test doubles, HTTP verbs, paths, status codes, attribute names, or literal URLs. Concrete domain values stay (a score of 4, 2 entries, the admin email); the transport goes.

| Avoid | Prefer |
| --- | --- |
| `Then quizService.create() is called once` | `Then a quiz is created and no option reveals whether it is correct` |
| `Then it throws NotFoundError` | `Then the request is rejected as not found` |
| `Given the repository mock returns null` | `Given the id does not exist, nothing is resolved` |
| `When the client GETs /api/users` | `When the client requests the list of users` | <!-- only:http-api -->
| `Then the response is 200 with 2 entries` | `Then the response succeeds with 2 entries` | <!-- only:http-api -->
| `Then the response is 401` | `Then the request is rejected as unauthenticated` | <!-- only:http-api -->
| `Then the response is 400 with a zod issue on "topic"` | `Then the submission is rejected because the topic is missing` | <!-- only:http-api -->
| `When the client POSTs /api/auth/login with the admin email and password` | `When the user signs in with the admin email and password` | <!-- only:http-api -->
| `Given the Authorization header carries a valid JWT` | `Given the user is signed in with a valid session` | <!-- only:http-api -->
| `When https://github.com/x/y/blob/main/README.md is fetched` | `When a markdown file is fetched from GitHub` |
| `Given fetch resolves with status 500` | `Given the source document cannot be retrieved` |
| `Then the span has attribute langfuse.user.id = "u_123"` | `Then the trace is attributed to the signed-in user` | <!-- only:observability -->
| `Then the <Button> has the disabled attribute` | `Then the submit button cannot be pressed while sending` | <!-- only:frontend -->

The same table applies to `it()` titles: `it("responds 401")` → `it("is rejected as unauthenticated")`.

---

## 8. What We Don't Test

- Type definitions and interfaces
- Simple pass-throughs with no logic (a function that only forwards args)
- Third-party library internals
- Constants and static config (unless computed)
- Framework wiring that has no branching (e.g. a route file that only registers handlers)
- Styling / visual appearance in unit tests <!-- only:frontend -->

---

## 9. Regression Policy

Edge cases not caught upfront are handled by regression tests, not by anticipatory over-testing.

When a bug is found:

1. Reproduce with a failing test at the **lowest sufficient level** (unit > integration<!-- IF:e2e --> > e2e<!-- ENDIF:e2e -->).
2. Tag the scenario `@regression` alongside its pyramid tag.
3. Fix. Verify green.
4. The PR shows the test fails with the fix reverted.

This keeps the suite lean while guaranteeing real failures never recur.
