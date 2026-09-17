/**
 * Installation service. Serves the wizard and the CLI flags alike: it receives
 * a normalized request, talks to the RegistrySource, the lockfile and the
 * filesystem, and never prompts or prints.
 */
import { mkdtemp, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AGENT_IDS, getAgent, resolveAgentSkillsDir, resolveCanonicalSkillsDir } from "./agents.js";
import { DestinationExistsError, DevSkillsError, NotManagedError, SymlinkError } from "./errors.js";
import { copyDirectory, linkDirectory, pathKind, removePath } from "./fs-utils.js";
import { hashDirectory } from "./hash.js";
import { readLockfile, writeLockfile } from "./lockfile.js";
import { findSkill } from "./registry.js";
import type {
  AgentId, InstallContext, InstallRequest, InstallResult, InstalledSkill, InstalledTarget, LockEntry, Lockfile,
  Registry, RegistrySkill, RemoveRequest, RemoveResult, Scope, UpdateRequest, UpdateResult,
} from "./types.js";

// ---------- helpers ----------

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

function sortAgents(agents: Iterable<AgentId>): AgentId[] {
  const set = new Set(agents);
  return AGENT_IDS.filter((id) => set.has(id));
}

async function withStaging<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "dev-skills-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Make `dest` free for writing. Broken links and managed content are replaced;
 * anything else is only replaced with `force`.
 */
async function clearDestination(dest: string, managed: boolean, force: boolean): Promise<void> {
  const kind = await pathKind(dest);
  if (kind === "missing") return;
  if (kind === "symlink") {
    const broken = (await pathKind(path.resolve(path.dirname(dest), await readlink(dest)))) === "missing";
    if (broken || managed || force) return removePath(dest);
    throw new DestinationExistsError(dest);
  }
  if (managed || force) return removePath(dest);
  throw new DestinationExistsError(dest);
}

/** Directories whose content the lockfile hash describes. */
function managedDirs(name: string, entry: LockEntry, ctx: InstallContext): string[] {
  if (entry.strategy === "symlink") return [path.join(resolveCanonicalSkillsDir(entry.scope, ctx), name)];
  return entry.agents.map((id) => path.join(resolveAgentSkillsDir(getAgent(id), entry.scope, ctx), name));
}

// ---------- install ----------

export async function install(req: InstallRequest, ctx: InstallContext): Promise<InstallResult> {
  if (req.skills.length === 0) throw new DevSkillsError("No skills requested", "EMPTY_REQUEST");
  if (req.agents.length === 0) throw new DevSkillsError("No agents requested", "EMPTY_REQUEST");
  const agents = sortAgents(req.agents.map((id) => getAgent(id).id));
  const registry = await ctx.source.getRegistry();
  const skills = req.skills.map((name) => findSkill(registry, name));
  const force = req.force ?? false;
  const lock = await readLockfile(req.scope, ctx);

  const result: InstallResult = { installed: [], canonical: [] };
  for (const skill of skills) {
    const existing = lock.skills[skill.name];
    const managed = existing !== undefined;
    const targets =
      req.strategy === "copy"
        ? await installCopies(skill, agents, req.scope, managed, force, ctx)
        : await installLinks(skill, agents, req.scope, managed, force, ctx, result.canonical);
    result.installed.push(...targets);

    lock.skills[skill.name] = {
      hash: skill.hash,
      agents: sortAgents([...(existing?.agents ?? []), ...agents]),
      scope: req.scope,
      strategy: req.strategy,
      installedAt: new Date().toISOString(),
    };
    await writeLockfile(req.scope, ctx, lock);
  }
  return result;
}

async function installCopies(
  skill: RegistrySkill, agents: AgentId[], scope: Scope, managed: boolean, force: boolean, ctx: InstallContext,
): Promise<InstalledTarget[]> {
  return withStaging(async (staging) => {
    const src = path.join(staging, skill.name);
    await ctx.source.fetchSkill(skill, src);
    const targets: InstalledTarget[] = [];
    const dests = agents.map((id) => ({ id, dest: path.join(resolveAgentSkillsDir(getAgent(id), scope, ctx), skill.name) }));
    for (const { dest } of dests) await clearDestination(dest, managed, force); // fail before writing anything
    for (const { id, dest } of dests) {
      await copyDirectory(src, dest);
      targets.push({ skill: skill.name, agent: id, path: dest, strategy: "copy" });
    }
    return targets;
  });
}

async function installLinks(
  skill: RegistrySkill, agents: AgentId[], scope: Scope, managed: boolean, force: boolean, ctx: InstallContext, canonicalOut: string[],
): Promise<InstalledTarget[]> {
  const canonical = path.join(resolveCanonicalSkillsDir(scope, ctx), skill.name);
  const links = agents
    .map((id) => ({ id, dest: path.join(resolveAgentSkillsDir(getAgent(id), scope, ctx), skill.name) }))
    .map((t) => ({ ...t, self: samePath(t.dest, canonical) }));

  await clearDestination(canonical, managed, force);
  for (const l of links) if (!l.self) await clearDestination(l.dest, managed, force);

  await withStaging(async (staging) => {
    const src = path.join(staging, skill.name);
    await ctx.source.fetchSkill(skill, src);
    await copyDirectory(src, canonical);
  });
  canonicalOut.push(canonical);

  const created: string[] = [];
  const link = ctx.symlink ?? ((target, linkPath) => linkDirectory(target, linkPath, ctx.platform ?? process.platform));
  try {
    for (const l of links) {
      if (l.self) continue;
      await link(canonical, l.dest);
      created.push(l.dest);
    }
  } catch (err) {
    // No half-installs: undo what this run created before surfacing the error.
    for (const p of created) await removePath(p);
    if (!managed) await removePath(canonical);
    const failed = links.find((l) => !l.self && !created.includes(l.dest));
    throw new SymlinkError(failed?.dest ?? "?", canonical, err);
  }

  return links.map((l) => ({ skill: skill.name, agent: l.id, path: l.self ? canonical : l.dest, strategy: "symlink" as const }));
}

// ---------- update ----------

export async function update(req: UpdateRequest, ctx: InstallContext): Promise<UpdateResult> {
  const lock = await readLockfile(req.scope, ctx);
  const registry = await ctx.source.getRegistry();
  const names = req.skills && req.skills.length > 0 ? req.skills : Object.keys(lock.skills);
  const result: UpdateResult = { updated: [], upToDate: [], modified: [], missing: [] };

  for (const name of names) {
    const entry = lock.skills[name];
    if (!entry) throw new NotManagedError(name, req.scope);
    const skill = registry.skills.find((s) => s.name === name);
    if (!skill) {
      result.missing.push(name);
      continue;
    }
    if (skill.hash === entry.hash) {
      result.upToDate.push(name);
      continue;
    }
    const dirs = managedDirs(name, entry, ctx);
    if (!req.force) {
      const hashes = await Promise.all(dirs.map((d) => hashDirectory(d).catch(() => "missing")));
      if (hashes.some((h) => h !== entry.hash)) {
        result.modified.push(name);
        continue;
      }
    }
    await withStaging(async (staging) => {
      const src = path.join(staging, name);
      await ctx.source.fetchSkill(skill, src);
      for (const dir of dirs) {
        await removePath(dir);
        await copyDirectory(src, dir);
      }
    });
    lock.skills[name] = { ...entry, hash: skill.hash, installedAt: new Date().toISOString() };
    await writeLockfile(req.scope, ctx, lock);
    result.updated.push(name);
  }
  return result;
}

// ---------- remove ----------

export async function remove(req: RemoveRequest, ctx: InstallContext): Promise<RemoveResult> {
  const lock = await readLockfile(req.scope, ctx);
  for (const name of req.skills) if (!lock.skills[name]) throw new NotManagedError(name, req.scope);

  const result: RemoveResult = { removed: [], canonicalRemoved: [] };
  for (const name of req.skills) {
    const entry = lock.skills[name]!;
    const canonical = path.join(resolveCanonicalSkillsDir(entry.scope, ctx), name);

    for (const id of entry.agents) {
      const dest = path.join(resolveAgentSkillsDir(getAgent(id), entry.scope, ctx), name);
      const kind = await pathKind(dest);
      if (entry.strategy === "copy") {
        // Only delete what we copied there: a real directory, never a link someone else made.
        if (kind === "directory") await removePath(dest);
      } else if (!samePath(dest, canonical)) {
        if (kind === "symlink") await removePath(dest);
      }
      result.removed.push({ skill: name, agent: id, path: samePath(dest, canonical) ? canonical : dest, strategy: entry.strategy });
    }

    if (entry.strategy === "symlink" && (await pathKind(canonical)) === "directory") {
      await removePath(canonical);
      result.canonicalRemoved.push(canonical);
    }

    delete lock.skills[name];
    await writeLockfile(req.scope, ctx, lock);
  }
  return result;
}

// ---------- list ----------

export async function listInstalled(ctx: InstallContext, registry?: Registry): Promise<InstalledSkill[]> {
  const scopes: Scope[] = ["project", "global"];
  const reg = registry ?? (await ctx.source.getRegistry().catch(() => undefined));
  const out: InstalledSkill[] = [];
  for (const scope of scopes) {
    const lock: Lockfile = await readLockfile(scope, ctx);
    for (const name of Object.keys(lock.skills).sort()) {
      const entry = lock.skills[name]!;
      const remote = reg?.skills.find((s) => s.name === name);
      out.push({ name, scope, entry, updateAvailable: remote !== undefined && remote.hash !== entry.hash });
    }
  }
  return out;
}
