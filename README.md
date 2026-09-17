# dev-skills

A public catalog of reusable [Agent Skills](https://agentskills.io) and a CLI that installs them into **Claude Code** and **OpenAI Codex** — per project or globally, as independent copies or as one shared canonical copy.

```bash
npx dev-skills
```

```
What would you like to do?      → Install skills
Select skills                   → ◉ bdd  ◉ bdd-init  ◉ bdd-regression  ◯ code-review  ◯ system-design
Select agents                   → ◉ Claude Code  ◉ OpenAI Codex
Where should these be installed → Project | Global
How should skills be shared?    → Symlink | Copy        (asked only when > 1 agent)
```

## Non-interactive

```bash
npx dev-skills list                                   # catalog (+ installed markers)
npx dev-skills list --installed                       # what the lockfiles track
npx dev-skills install bdd                            # all agents, project scope, copy
npx dev-skills install bdd code-review system-design  # several skills
npx dev-skills install bdd --agent codex              # one agent
npx dev-skills install bdd --agent claude-code --agent codex --strategy symlink
npx dev-skills install bdd --global                   # user-level directories
npx dev-skills install bdd --force                    # overwrite an unmanaged destination
npx dev-skills update                                 # every project skill whose registry hash changed
npx dev-skills update bdd --global --force            # overwrite local edits
npx dev-skills remove bdd                             # only what the lockfile owns
```

Subcommands never prompt. Defaults when a flag is omitted: every agent, `project` scope, `copy` strategy.

## Where skills go

| Agent | Project | Global |
| --- | --- | --- |
| Claude Code | `.claude/skills/<name>/` | `~/.claude/skills/<name>/` |
| OpenAI Codex | `.agents/skills/<name>/` | `~/.agents/skills/<name>/` |

Paths follow each agent's official discovery rules. Adding an agent is one entry in [`packages/cli/src/services/agents.ts`](packages/cli/src/services/agents.ts); the installer never branches on agent ids.

### Copy

Each selected agent receives its own full copy of the skill directory. Editing one copy does not affect the others.

### Symlink

One canonical copy lives in the agent-neutral directory (`.agents/skills/<name>` for a project, `~/.agents/skills/<name>` globally) and every other agent gets a link to it:

```
.claude/skills/bdd  →  .agents/skills/bdd  ←  (Codex reads this directory natively)
```

Codex already discovers `.agents/skills`, so it uses the canonical copy directly. On Windows the links are directory junctions (no elevated privileges). If the OS refuses to create a link nothing is left half-installed; the wizard offers to fall back to copies.

## Lockfile

`.agents/skills-lock.json` (project) and `~/.agents/skills-lock.json` (global) are the source of truth:

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

- `update` compares the lockfile hash with the registry hash; a locally modified skill (installed hash ≠ lockfile hash) is skipped unless `--force`. Copy mode refreshes every copy, symlink mode only the canonical one.
- `remove` deletes only paths the lockfile lists — links are unlinked, never followed; the canonical copy goes when no agent references it. Anything not in the lockfile is refused.
- Hashes ignore CRLF/LF differences so Windows checkouts do not look modified.

## Catalog

```
packages/skills/
├── registry.json                 generated — never edit by hand
└── skills/<category>/<name>/
    ├── SKILL.md                  required: YAML frontmatter with name + description
    ├── references/               optional
    ├── scripts/                  optional
    └── assets/                   optional
```

The **directory** is the distribution unit — every file in it is installed. `registry.json` carries, per skill, the content hash and the file list, so the CLI needs only raw downloads from GitHub (no API calls, no rate limits).

| Skill | Category | What it does |
| --- | --- | --- |
| `bdd` | development | Gated feature workflow: feature file → approval → tests → code → run → refactor |
| `bdd-init` | development | Bootstraps a project: `specs/`, stack-tailored `docs/TESTING_PHILOSOPHY.md`, lint + parity scripts, Claude Code hooks/rules; offers missing test levels |
| `bdd-regression` | development | Bug fix: `@regression` scenario → failing test → fix → prove by revert |
| `code-review` | development | Severity-tagged review of a diff / PR / file with concrete fixes |
| `system-design` | architecture | Framed requirements → 2–3 options → ADR, plus an architecture review checklist |

The three `bdd-*` skills work together — install them as a set: `npx dev-skills install bdd bdd-init bdd-regression`.

### Adding a skill

1. Create `packages/skills/skills/<category>/<name>/SKILL.md` with frontmatter:
   ```markdown
   ---
   name: <kebab-case name>
   description: What it does and exactly when it should (not) trigger.
   ---
   ```
2. Add `references/`, `scripts/`, `assets/` as needed. Keep every path inside the skill directory relative.
3. `pnpm generate:registry` and commit `registry.json` together with the skill. CI runs `pnpm check:registry` and fails when it is stale.

## Development

```bash
pnpm install
pnpm test                 # vitest, sandboxed in temp dirs — never touches ~/.claude or ~/.agents
pnpm typecheck
pnpm build                # packages/cli/dist
pnpm generate:registry

# run the CLI against the local catalog instead of GitHub
DEV_SKILLS_SOURCE=$PWD/packages/skills node packages/cli/dist/index.js list
DEV_SKILLS_REF=<branch>   # pin a GitHub ref
```

### Architecture

```
CLI / Wizard (commander, @clack/prompts)      packages/cli/src/index.ts, ui/wizard.ts
     ↓
Commands (flags → request, print results)     packages/cli/src/commands/*
     ↓
Installer (install / update / remove / list)  packages/cli/src/services/installer.ts
     ↓
Agents · Registry · Lockfile · Hash            packages/cli/src/services/*
     ↓
Filesystem (fs/promises) · RegistrySource      GitHubSource | LocalSource
```

- The wizard and the flag-based commands build the same `InstallRequest` and call the same installer.
- Services never prompt or print; the UI never touches the filesystem.
- `RegistrySource` abstracts where skills come from (GitHub raw today; a CDN would be another implementation).

## License

MIT
