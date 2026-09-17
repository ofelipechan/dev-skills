<div align="center">

# 🧰 dev-skills

**One catalog of Agent Skills. One command to put them in front of every coding agent you use.**

[![npm](https://img.shields.io/npm/v/@ofelipechan/dev-skills)](https://www.npmjs.com/package/@ofelipechan/dev-skills)
[![CI](https://github.com/ofelipechan/dev-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/ofelipechan/dev-skills/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

```bash
npx @ofelipechan/dev-skills
```

</div>

---

## 📖 Table of Contents

- [✨ What is a Skill?](#-what-is-a-skill)
- [🤖 Supported Agents](#-supported-agents)
- [📚 Skills Catalog](#-skills-catalog)
- [🚀 Quick Start](#-quick-start)
- [⌨️ CLI Reference](#️-cli-reference)
- [⚙️ How It Works](#️-how-it-works)
- [🧩 Adding a Skill](#-adding-a-skill)
- [🛠️ Development](#️-development)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)

---

## ✨ What is a Skill?

A skill is a folder an AI coding agent can load on demand: a `SKILL.md` with instructions, plus any references, scripts or assets those instructions point at. Think of it as a playbook the agent reads only when the task matches — a BDD workflow, a review checklist, an architecture template — instead of stuffing every rule into one giant system prompt.

```
<name>/
├── SKILL.md          # required — YAML frontmatter (name, description) + instructions
├── references/       # optional — docs the skill reads
├── scripts/          # optional — tools the skill runs
└── assets/           # optional — templates, images, data
```

The **directory is the unit**. `dev-skills` never installs a lone `SKILL.md`; the whole folder travels together so every relative path inside it keeps working.

---

## 🤖 Supported Agents

| Agent | Project install | Global install | Notes |
| --- | --- | --- | --- |
| **Claude Code** | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` | |
| **OpenAI Codex** | `.agents/skills/<name>/` | `~/.agents/skills/<name>/` | reads the shared `.agents/skills` directory natively |

Paths follow each agent's official discovery rules. Supporting another agent is one entry in [`agents.ts`](packages/cli/src/services/agents.ts) — the installer never branches on agent ids. Missing yours? [Open an issue](https://github.com/ofelipechan/dev-skills/issues).

---

## 📚 Skills Catalog

| Skill | Category | What it gives your agent |
| --- | --- | --- |
| [`bdd`](packages/skills/skills/development/bdd) | development | A gated feature workflow — feature file → approval → tests → code → run → refactor — with hard stops between phases |
| [`bdd-init`](packages/skills/skills/development/bdd-init) | development | Bootstraps a project for BDD: `specs/`, a `TESTING_PHILOSOPHY.md` rendered for the detected stack, lint + parity scripts, Claude Code hooks and rules; offers missing test levels (e.g. E2E) |
| [`bdd-regression`](packages/skills/skills/development/bdd-regression) | development | Bug-fix discipline: `@regression` scenario → failing test → fix → prove by reverting |
| [`code-review`](packages/skills/skills/development/code-review) | development | Severity-tagged findings, one line each, with a concrete fix and a merge verdict |
| [`system-design`](packages/skills/skills/architecture/system-design) | architecture | Framed requirements → 2–3 options → ADR, plus a review checklist for existing designs |

The three `bdd-*` skills are a set — install them together:

```bash
npx @ofelipechan/dev-skills install bdd bdd-init bdd-regression
```

Everything here is what I actually use day to day. New skills land when they have earned their place in a real project.

---

## 🚀 Quick Start

Run the wizard in any repository:

```bash
npx @ofelipechan/dev-skills
```

```
◆  What would you like to do?
│  ● Install skills
│  ○ Update skills
│  ○ Remove skills
│  ○ List installed skills
│
◆  Select skills
│  ◼ bdd            Gated Behaviour-Driven Development…
│  ◼ bdd-init       Bootstrap the BDD harness in a project…
│  ◼ bdd-regression Bug-fix workflow…
│  ◻ code-review    Review a diff, branch, pull request…
│  ◻ system-design  Design or review a software architecture…
│
◆  Select agents
│  ◼ Claude Code
│  ◼ OpenAI Codex
│
◆  Where should these skills be installed?
│  ● Project      relative to the current directory
│  ○ Global       user-level agent directories
│
◆  How should skills be shared between agents?     ← only asked for more than one agent
│  ● Symlink      keep one canonical copy and link each agent to it
│  ○ Copy         create an independent copy for each agent
│
◇  Installed 3 skill(s) into 2 agent(s) [project, symlink]
```

That is it — open your agent and the skills are discoverable.

---

## ⌨️ CLI Reference

Every subcommand is non-interactive: when the flags are enough, nothing is asked. Built for scripts and CI.

```bash
# Browse
npx @ofelipechan/dev-skills list                       # catalog, with [installed: project|global] markers
npx @ofelipechan/dev-skills list --installed           # only what the lockfiles track

# Install
npx @ofelipechan/dev-skills install bdd                # defaults: every agent · project scope · copy
npx @ofelipechan/dev-skills install bdd code-review    # several at once
npx @ofelipechan/dev-skills install bdd --agent codex  # one agent (repeat --agent for more)
npx @ofelipechan/dev-skills install bdd --global       # user-level directories
npx @ofelipechan/dev-skills install bdd --agent claude-code --agent codex --strategy symlink
npx @ofelipechan/dev-skills install bdd --force        # replace a directory dev-skills does not manage

# Maintain
npx @ofelipechan/dev-skills update                     # everything in the project lockfile with a newer registry hash
npx @ofelipechan/dev-skills update bdd --global        # specific skills, global scope
npx @ofelipechan/dev-skills update --force             # overwrite locally modified skills
npx @ofelipechan/dev-skills remove bdd                 # unlink / delete only what the lockfile owns
npx @ofelipechan/dev-skills remove bdd --global
```

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `-a, --agent <id>` | install | `claude-code` or `codex`; repeatable; default all |
| `-g, --global` | install · update · remove | act on `~/…` directories and the global lockfile |
| `-s, --strategy <copy\|symlink>` | install | how files are laid out; default `copy` |
| `-f, --force` | install · update | overwrite unmanaged or locally modified content |
| `-i, --installed` | list | show installed instead of available |

---

## ⚙️ How It Works

### Copy vs. symlink

**Copy** gives every agent its own independent directory. Edit one, the others stay untouched.

**Symlink** keeps a single canonical copy in the agent-neutral `.agents/skills/` (or `~/.agents/skills/` for global installs) and links every other agent to it:

```
.claude/skills/bdd  ──▶  .agents/skills/bdd  ◀──  Codex (reads this folder directly)
```

One source of truth; an edit is visible to every agent at once. On Windows the links are directory junctions, so no elevated shell is needed. If the OS refuses to link, nothing is left half-installed and the wizard offers to fall back to copies.

### Lockfile

`.agents/skills-lock.json` (project) and `~/.agents/skills-lock.json` (global) record what was installed, for which agents, how, and from which content hash:

```json
{
  "version": 1,
  "skills": {
    "bdd": {
      "hash": "sha256:…",
      "agents": ["claude-code", "codex"],
      "scope": "project",
      "strategy": "symlink",
      "installedAt": "2026-09-17T20:21:32.060Z"
    }
  }
}
```

- `update` compares the lockfile hash with the registry. A skill you edited locally (installed hash ≠ lockfile hash) is reported and skipped unless `--force`. Copy installs refresh every copy; symlink installs refresh only the canonical directory.
- `remove` touches only paths the lockfile lists. Links are unlinked, never followed. The canonical copy is deleted once no agent references it. A folder that merely looks like a skill is never deleted.
- Hashes ignore CRLF/LF differences, so a Windows checkout does not look "modified".

### Distribution

The catalog lives in this repository. `registry.json` is generated from the skill folders and carries, per skill, the description, the content hash and the full file list — so the CLI needs only raw file downloads from GitHub, no API calls and no rate limits. The source is abstracted behind a `RegistrySource` interface; a CDN would be another implementation with zero changes to the installer.

---

## 🧩 Adding a Skill

1. Create the folder:
   ```
   packages/skills/skills/<category>/<name>/SKILL.md
   ```
2. Give `SKILL.md` frontmatter the agents can index:
   ```markdown
   ---
   name: <kebab-case-name>
   description: What it does and exactly when it should — and should not — trigger.
   ---
   ```
3. Put supporting material in `references/`, `scripts/`, `assets/`. Reference them with paths relative to the skill folder.
4. Regenerate and commit the registry with the skill:
   ```bash
   npm run generate:registry
   ```
   CI runs `npm run check:registry` and fails if the committed file is stale.

Guidelines: one job per skill · say when it should *not* trigger · prefer scripts the agent can run over prose it has to interpret · keep it self-contained.

---

## 🛠️ Development

```bash
npm install
npm test                 # vitest — sandboxed in temp dirs, never touches ~/.claude or ~/.agents
npm run typecheck
npm run build                # → packages/cli/dist
npm run generate:registry    # → packages/skills/registry.json
```

Run the built CLI against the local catalog instead of GitHub:

```bash
DEV_SKILLS_SOURCE=$PWD/packages/skills node packages/cli/dist/index.js list
DEV_SKILLS_REF=<branch-or-tag>   # pin a GitHub ref instead
```

### Layout

```
dev-skills/
├── packages/
│   ├── cli/                 npm package "dev-skills"
│   │   ├── src/index.ts     entry — wizard or subcommands
│   │   ├── src/ui/          @clack/prompts wizard (no filesystem access)
│   │   ├── src/commands/    flags → request → print
│   │   └── src/services/    agents · registry · downloader · installer · lockfile · hash
│   └── skills/
│       ├── registry.json    generated
│       └── skills/<category>/<name>/
├── scripts/generate-registry.ts
└── .github/workflows/       CI matrix (ubuntu · windows · macos) + npm publish on main
```

```
Wizard / CLI flags  →  Commands  →  Installer  →  Agents · Registry · Lockfile  →  fs + RegistrySource
```

The wizard and the flag-based commands build the same `InstallRequest` and hand it to the same installer. Services never prompt or print; the UI never touches the filesystem; agent paths exist in exactly one file.

---

## 🤝 Contributing

Issues and pull requests welcome — a new skill, a new agent, a sharper edge on an existing one. Before opening a PR: `npm test`, `npm run typecheck`, `npm run check:registry`. Keep skills self-contained and describe precisely when they should trigger.

---

## 📄 License

[MIT](LICENSE) — the CLI and every skill in this repository.
