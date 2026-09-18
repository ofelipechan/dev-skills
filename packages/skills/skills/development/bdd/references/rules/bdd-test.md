---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
---

# Test files

Extract of `docs/TESTING_PHILOSOPHY.md` § 1, § 4, § 5, § 7, § 8. Hook `check-test.mjs` enforces binding + naming; fix its errors before moving on.

## Binding
Every tagged scenario has exactly one test bound to it. A bound test carries a JSDoc directly above it: one sentence stating the **rule**, then `@scenario "<title>"` byte-identical to a `Scenario:` line in `specs/`. Tests without a binding are allowed (extra invariants, § 8 material) — the parity that matters is scenario → test, not test → scenario.

```ts
/**
 * An expired session cannot be used to access protected resources.
 * @scenario "a user with an expired session is asked to sign in again"
 */
it("rejects the request when the session token has expired", () => { /* ... */ });
```

- One scenario ↔ one test. `it.each` takes one annotation above the call.
- `it.skip` / `it.todo` carry no annotation — tag the scenario `@unimplemented` instead.
- Items in § 8 (types, pass-throughs, third-party internals, static config, wiring without branching, styling) get no scenario and no test.

## Naming
- **No "should"**. Present tense, active voice: `it("signs in a user")`.
- Title says *how the test proves it*; JSDoc says *the rule*. Same phrasing rules as scenarios: no HTTP verbs, paths, status codes, class/function names, doubles. `it("responds 401")` → `it("is rejected as unauthenticated")`.
- `describe` names the unit: `name()` · `ClassName` · `<Component/>` · `useHook()` · `METHOD /path`.

## Structure

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

One invariant per test. Two assertions that can fail for different reasons → split.

## Doubles — real by default, fake only at external boundaries
| Dependency | Approach |
| --- | --- |
| Own code (services, helpers, mappers) | real |
| Database | real test DB in integration; injected fake repository in unit |
| HTTP APIs, third-party SDKs | stub at network/SDK boundary |
| LLMs / non-deterministic services | fixed minimal stub; never the real model |
| File system | in-memory or temp dir |
| Time, randomness, IDs | inject or fake — deterministic |
| Env vars | set explicitly in the test |

Never mock own code. Module-level mocking (`vi.mock`, `jest.mock`) is a last resort for third-party boundaries only. Depend on abstract contracts so a fake is injected, not patched.

## Data
Minimal, context-specific, deterministic. Only what the rule needs: `{ id: "u1", role: "guest" }`. Never real personal data.

## Level
`@unit` → all collaborators faked · `@integration` → own code + in-process infra real, external services faked · `@e2e` → everything real except third parties, disposable seeded DB. Do not prove the same rule at two levels.
