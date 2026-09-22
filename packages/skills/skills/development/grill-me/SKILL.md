---
name: grill-me
description: Interview the user relentlessly about a plan, decision, or idea until nothing is left silently assumed. Use when the user wants to stress-test their thinking. Not for questions you can answer yourself from the codebase or docs.
license: CC-BY-4.0
metadata:
  author: Felipe Chan - https://github.com/ofelipechan
  version: 1.0.0
---

# Grill me

Interview the user relentlessly until you reach a shared understanding. Map this as a design tree: every decision branches into the decisions that hang off it.

**Goal:** no decision in the final plan is a guess.

Do not write any code, build, or summarize anything until the interview is done.

Scale to the ask — a small, unambiguous topic may need one round or none (say so and move on); a vague or high-stakes one needs to follow the workflow below.

## 1. Map the design tree

Model the topic as a **design tree**: every decision branches into the decisions that hang off it. Typical nodes:

- **Purpose** — what triggered this request; what problem it solves; what success looks like in the user's own words
- **Audience** — who uses it, how technical they are, on what device or in what context
- **Scope** — must-haves vs. nice-to-haves; what is explicitly OUT
- **Constraints** — deadline, budget, tech stack, brand rules, platform, required integrations
- **Content & data** — where data comes from, formats, volume, real examples the user can share
- **Edge cases & failure** — unusual inputs, error states, what "wrong" looks like
- **Taste** — examples they love or hate; tone and style references
- **Lifecycle** — one-off or maintained; who maintains it; growth expectations; what happens if it is wrong; how it is undone
- **Rejection criteria** — what would make them send it back for rework (often the most revealing question of all)

Do not ask about the whole tree at once. Work it in rounds.

## 2. Ask the frontier, one round at a time

The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you have not heard yet.

- Ask the whole frontier in one round, then **wait** for the user's answers.
- A question whose answer depends on another question still open in this round belongs to a _later_ round.
- Each round the answers reshape the tree: settled decisions push the frontier outward and unblock dependent questions. Recompute the frontier and ask the next round.
- **Facts are your job, decisions are the user's**. When a frontier question needs a fact from the environment (filesystem, code, config, docs), look it up yourself (sub-agent if available); never ask the user for something you could find. Only the questions downstream of that lookup wait; ask the rest of the frontier now.

## 3. How to ask

Every question is multiple choice: 2–4 concrete options, each a real alternative with a clear and short consequence, and exactly one marked as recommended. Never a bare open question — a choice with a recommendation is faster to answer and harder to misread.

- If the agent has a structured question tool (Claude Code: `AskUserQuestion`, Codex: `request_user_input`) → use the tool; do not write the questions as chat text.
- No such tool (plain chat) → same content in text:

  ```
  ❓ **Q1 — <topic>**: <question>
     (a) <option> (Recommended) — <consequence>
     (b) <option> — <consequence>
     (c) <option> — <consequence>

  ❓ **Q2 — <topic>**: …
  ```

Be relentless, not rude: push on vague answers ("it depends" → on what? offer the cases), name contradictions between answers, and revisit a settled node when a later answer undermines it.

## 4. Finish

The interview is done when the frontier is empty: every branch visited, nothing left silently assumed. Then:

- Display the main goal in one sentence.
- Explain who this is for and what the context is.
- Play back the settled decisions as a short list (one line each, grouped by branch).
- List the must-haves.
- Name anything the user chose against the recommendation, with the recommendation beside it (no re-arguing, just visible).
- List what is out of scope.
- List constraints.
- Ask the user to confirm the shared understanding before any downstream work starts. That question **ends the turn**.

## Never

- Ask the user for a fact you could look up.
- Ask a question whose prerequisite is still open in the same round.
- Start writing the plan, spec, or code before the user confirms the playback.
