---
name: system-design
description: Design or review a software architecture — requirements, constraints, component boundaries, data flow, failure modes, trade-offs — and produce a decision record with named alternatives. Use when the user asks to "design the system", "architect", "how should we structure", "review the architecture", "write an ADR", or before implementing a feature that crosses service or data boundaries. Not for single-function implementation details.
---

# System design

Design is choosing what to leave out. Output: a decision, its alternatives, and the reasons — short enough to be read before every related change.

## 1. Frame the problem (ask, don't assume)

Collect in **one** batched message when unknown:

- **Goal** — the user-visible outcome; the one metric that says it works.
- **Load & scale** — requests/s, data volume, growth, peaks; today and in 12 months.
- **Constraints** — existing stack, team size, budget, compliance (PII, retention), deadlines, must-reuse components.
- **Quality attributes ranked** — pick the top 3 of: consistency, availability, latency, throughput, cost, simplicity, evolvability, security, observability. Everything else is traded away.
- **Non-goals** — explicit.

Stop if the goal or the top-3 attributes are unclear. A design that optimizes for the wrong attribute is worse than no design.

## 2. Map what exists

Read the codebase before drawing: entry points, services, data stores, external integrations, deployment shape. List the boundaries that already exist; a new design that ignores them will not ship.

## 3. Propose

For each viable option (2–3, never 1):

```
Option <n>: <name>
  Shape:      components, ownership of data, sync/async edges
  Data flow:  request → … → response; write path; read path
  Failure:    what breaks when each component is down / slow / partial; retries, idempotency, backpressure
  Ops:        deploy, migrate, observe (logs/metrics/traces), roll back
  Cost:       infra + people (build, run, learn)
  Fits:       which of the top-3 attributes it serves, which it sacrifices
```

Prefer the simplest option that meets the ranked attributes. Boring technology first. One database until a measured reason says otherwise. Synchronous until latency or coupling forces async. No microservices for a single team.

## 4. Decide and record

Write the decision as an ADR (`docs/adr/NNNN-<slug>.md` or the project's convention):

```markdown
# <NNNN>. <Title>

Date: <YYYY-MM-DD>   Status: proposed | accepted | superseded by <NNNN>

## Context
<problem, constraints, ranked quality attributes, what exists>

## Decision
<the chosen option, its shape, the boundaries it introduces>

## Alternatives considered
<option name — why rejected, in one line each>

## Consequences
<what becomes easier, what becomes harder, follow-ups, how we will know it was wrong>
```

Add a diagram only when the shape is non-obvious (Mermaid or a text box drawing). Keep it under one screen.

## 5. Review checklist (for reviewing an existing design)

- Each component has one owner and one reason to change.
- Every data item has exactly one system of record.
- Every cross-boundary call has a timeout, a retry policy and an idempotency story.
- Every failure mode has a detection signal (metric/alert) and a runbook line.
- Schema and API changes have a migration and a compatibility window.
- Security: authn/authz at each boundary, secrets outside code, PII inventory.
- The design can be rolled out incrementally and rolled back.
- Nothing exists "for later".

Report findings the same way as a code review: one line each, severity-tagged, with the fix.
