# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository. The README is user-facing documentation; this file is about *how to change the code*.

## What this project is

`@ofelipechan/dev-skills` is a CLI that installs **Agent Skills** (a `SKILL.md` plus `references/`, `scripts/`, `assets/`) into the directories where coding agents discover them — Claude Code (`.claude/skills`) and OpenAI Codex (`.agents/skills`). The catalog of skills lives in this same repo and is distributed by raw GitHub downloads, indexed by a generated `registry.json`.

Two things ship from here:

| Package | Path | Published? |
| --- | --- | --- |
| CLI | `packages/cli` | yes — npm `@ofelipechan/dev-skills` |
| Skill catalog | `packages/skills` | no — read from GitHub at runtime |

## Repository layout

```
dev-skills/
├── package.json                 npm workspaces root; scripts delegate to packages/cli
├── tsconfig.json                shared strict TS config (ES2022, NodeNext, ESM)
├── scripts/
│   ├── generate-registry.ts     scans packages/skills/skills/**/SKILL.md → registry.json (--check for CI)
│   └── prepare-package.mjs      copies README/LICENSE into packages/cli before publish
├── packages/
│   ├── cli/
│   │   ├── src/index.ts         entry: no args → wizard, subcommand → non-interactive
│   │   ├── src/ui/wizard.ts     @clack/prompts flow; builds requests, never touches the fs
│   │   ├── src/commands/        install · list · update · remove · output (flags → request → print)
│   │   ├── src/services/        the actual logic (see Architecture)
│   │   └── test/                vitest, sandboxed in temp dirs
│   └── skills/
│       ├── registry.json        GENERATED — never edit by hand
│       └── skills/<category>/<name>/SKILL.md (+ references/ scripts/ assets/)
└── .github/workflows/ci.yml     test matrix (ubuntu · windows · macos) + tag-gated npm publish
```

## Architecture

Strict one-way layering. Each layer only depends on the ones below it.

```
Wizard (ui/) ─┐
              ├─→ InstallRequest / UpdateRequest / RemoveRequest ─→ services/installer.ts
Commands ─────┘                                                        │
                                                    ┌──────────────────┼──────────────────┐
                                                 agents.ts        lockfile.ts        registry.ts / downloader.ts
                                               (paths per agent)  (what we own)     (RegistrySource impls)
                                                    └──────────────────┴──────────────────┘
                                                                  fs-utils.ts · hash.ts
```

Key files in `packages/cli/src/services/`:

| File | Responsibility | Rule |
| --- | --- | --- |
| `types.ts` | Shared contracts (`InstallRequest`, `RegistrySource`, `Lockfile`, `InstallContext`, result types) | Every layer speaks in these terms |
| `agents.ts` | `AGENTS` table: id, display name, project dir, global dir; canonical dir for symlink mode | **The only file that knows agent paths.** Adding an agent = one entry here + one test |
| `installer.ts` | `install()`, `update()`, `remove()`, `listInstalled()` | Never prompts, never prints. Receives an `InstallContext`, returns result objects, throws typed errors |
| `registry.ts` | Zod schemas for `registry.json` and `SKILL.md` frontmatter, `buildRegistry()`, `LocalSource` | Skill names are validated kebab-case |
| `downloader.ts` | `GitHubSource` — raw file downloads only, no GitHub API | Swap source = implement `RegistrySource`; installer unchanged |
| `lockfile.ts` | Read/write `.agents/skills-lock.json` (project) / `~/.agents/skills-lock.json` (global), Zod-validated | Lockfile is the source of truth for what dev-skills owns |
| `hash.ts` | `sha256:` over sorted `rel\0filehash` pairs; CRLF normalized to LF | Same function used by the generator and the installer, so hashes are comparable |
| `fs-utils.ts` | `copyDirectory`, `linkDirectory` (junction on win32, relative symlink elsewhere), `pathKind`, `removePath` | No business rules |
| `errors.ts` | `DevSkillsError` subclasses with a `code` (`SKILL_NOT_FOUND`, `DESTINATION_EXISTS`, `SYMLINK_FAILED`, `NOT_MANAGED`, …) | Commands map these to messages; services just throw |
| `context.ts` | Builds the real `InstallContext` (cwd, home, source from env) | Tests build their own with temp dirs |

### Invariants worth knowing before touching `installer.ts`

- **The directory is the unit.** A skill is always fetched whole into a staging temp dir, then copied. Never install a lone `SKILL.md`.
- **Fail before writing.** Copy installs check every destination with `clearDestination()` first, then write. Symlink installs roll back links and the canonical dir on failure — no half-installs.
- **Only touch what the lockfile owns.** `remove` deletes real directories for copy installs and unlinks (never follows) links for symlink installs. Unmanaged paths require `--force` on install and are refused on remove.
- **Symlink mode** puts one canonical copy in `.agents/skills/<name>` and links every other agent to it. An agent whose own dir *is* the canonical dir (Codex) gets no link (`self: true`).
- **`update`** compares registry hash vs lockfile hash; if the installed directory hash differs from the lockfile hash the skill is reported as `modified` and skipped unless `--force`.
- Hashes ignore line endings, so a Windows checkout never looks modified.

## Workflow

### Setup

```bash
npm install
```

Node ≥ 20 (CI uses 22). Dependencies are pinned exactly (`.npmrc` → `save-exact=true`); do not loosen versions.

### Day-to-day commands (run from repo root)

```bash
npm test                  # vitest run — sandboxed, never touches real ~/.claude or ~/.agents
npm run typecheck         # tsc --noEmit
npm run build             # → packages/cli/dist
npm run generate:registry # rewrite packages/skills/registry.json
npm run check:registry    # exit 1 if the committed registry is stale (CI runs this)
```

Run the CLI from source or against the local catalog:

```bash
npm run dev -w @ofelipechan/dev-skills -- list
```

```bash
DEV_SKILLS_SOURCE=$PWD/packages/skills node packages/cli/dist/index.js list
```

`DEV_SKILLS_REF=<branch|tag>` pins the GitHub ref instead of `main`.

### Before you say a change is done

All four must pass — this is exactly what CI runs on three OSes:

```bash
npm run check:registry; npm run typecheck; npm run build; npm test
```

If you touched anything under `packages/skills/skills/`, run `npm run generate:registry` and commit the resulting `registry.json` in the same commit.

### Releasing

1. Bump `version` in `packages/cli/package.json` and commit.
2. Publish a GitHub Release whose tag matches exactly: `gh release create v0.2.0 --generate-notes` (or via the GitHub UI).
3. CI runs the matrix on the release, verifies tag == package version, publishes with npm provenance.

Pushes to `main` and bare tag pushes never publish — only a published Release does. Do not add publish steps outside the release job.

## Conventions

### TypeScript

- ESM only (`"type": "module"`). Relative imports **must** include the `.js` extension (`./agents.js`), even from `.ts` files — NodeNext resolution.
- Strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Expect `T | undefined` on index access; use `?? default` or a non-null assertion only when the invariant is obvious (e.g. after a lockfile membership check).
- Optional fields on request types are `field?: boolean` — pass `{ ...(x ? { x } : {}) }` rather than `x: undefined`.
- Node built-ins are imported with the `node:` prefix.
- Runtime validation of external data (registry, lockfile, frontmatter) goes through Zod schemas in the owning service file; errors surface as `InvalidRegistryError` / `InvalidLockfileError` with `z.prettifyError`.
- Paths: skill-relative paths stored in the registry, lockfile, or hashes are **POSIX-separated and sorted**. Anything the OS touches goes through `node:path`.

### Layer rules (enforced by review, not tooling)

- `services/` never calls `console`, `process.stdout`, `process.exit`, or `@clack/prompts`.
- `ui/` and `commands/` never call `node:fs` directly; they call the installer.
- `commands/output.ts` is the only place non-interactive text is formatted. Errors print as `error: <message> [<CODE>]` to stderr and set `process.exitCode = 1`.
- Wizard and flag commands must produce identical `InstallRequest`s for the same intent. If you add a flag, add the matching wizard prompt (or a sensible default) and vice versa.
- Every agent-specific path lives in `agents.ts`. If you find yourself writing `".claude"` anywhere else, stop.

### File headers

Each source file opens with a short `/** … */` block stating its responsibility and the rule it obeys (e.g. "never prompts or prints", "no filesystem access in this file"). Keep that style for new files; it's how the layering stays legible.

### Tests

- Framework: vitest, `packages/cli/test/**/*.test.ts`, 20 s timeout.
- `test/helpers.ts` provides `makeSandbox()` → temp `catalog/`, `project/`, `home/` and an `InstallContext` pointing at them with a `LocalSource`. **Always use it**; never write to the real home directory.
- Pattern: `beforeEach(makeSandbox)`, `afterEach(cleanup)`, a small `req()` factory with overrides.
- Each `it` has a one-line doc comment above it stating the behaviour in plain language.
- Assert on filesystem state (`isRealDir`, `isSymlink`, `linkTarget`, `readJson`) and on the returned result objects; assert thrown errors by class (`rejects.toThrow(DestinationExistsError)`).
- Symlink failure is simulated via `ctx.symlink` override, not by mocking `node:fs`.
- Tests must pass on Windows: never assume `/` in OS paths, never assume symlink permissions (junctions are used on win32).
- Adding a service function → add a test file or describe block for it. Adding an agent → extend `agents.test.ts`.

### Commits

- Conventional Commits, lowercase, imperative: `feat:`, `fix:`, `refactor(catalog):`, `ci:`, `chore:`, `docs:`. Subject ≤ ~70 chars; body only when the *why* isn't obvious.
- Always ask for permission before adding or pushing a commit.

## Adding a skill to the catalog

1. Create `packages/skills/skills/<category>/<name>/SKILL.md` with frontmatter:
   ```markdown
   ---
   name: <kebab-case, must equal the folder name>
   description: What it does and exactly when it should — and should not — trigger.
   ---
   ```
   `name` is validated against `^[a-z0-9]+(?:-[a-z0-9]+)*$`; `buildRegistry` fails otherwise.
2. Supporting material goes in `references/`, `scripts/`, `assets/`, referenced by paths relative to the skill folder.
3. `npm run generate:registry`, commit `registry.json` with the skill.
4. Add a row to the README **Skills Catalog** table.

Guidelines: one job per skill · state when it must *not* trigger · prefer runnable scripts over prose · self-contained (no reaching outside the folder).

## Adding an agent

1. Add an entry to `AGENTS` in `packages/cli/src/services/agents.ts` (id, display name, project dir, global dir). Extend the `AgentId` union in `types.ts`.
2. Add cases to `packages/cli/test/agents.test.ts`.
3. Add a row to the README **Supported Agents** table and the `--agent` help text is derived automatically.

Nothing in the installer should need to change.

## Things not to do

- Don't hand-edit `packages/skills/registry.json`.
- Don't edit `packages/cli/README.md` or `packages/cli/LICENSE` — they're gitignored copies created at publish time.
- Don't commit `dist/`.
- Don't add GitHub API calls to the downloader; raw downloads are deliberate (no rate limits, no auth).
- Don't make services print or prompt, or make the UI touch the filesystem.
- Don't relax the "only delete what the lockfile owns" rule, even for convenience.
