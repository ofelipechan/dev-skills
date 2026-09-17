/**
 * Lockfile = source of truth for what dev-skills manages.
 * Project: `<cwd>/.agents/skills-lock.json`  Global: `~/.agents/skills-lock.json`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AGENT_IDS } from "./agents.js";
import { InvalidLockfileError } from "./errors.js";
import type { AgentId, InstallContext, Lockfile, Scope } from "./types.js";

export const LOCKFILE_NAME = "skills-lock.json";

const LockEntrySchema = z.object({
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  agents: z.array(z.enum(AGENT_IDS as [AgentId, ...AgentId[]])).min(1),
  scope: z.enum(["project", "global"]),
  strategy: z.enum(["copy", "symlink"]),
  installedAt: z.string(),
});

export const LockfileSchema = z.object({
  version: z.literal(1),
  skills: z.record(z.string(), LockEntrySchema),
});

export function emptyLockfile(): Lockfile {
  return { version: 1, skills: {} };
}

export function lockfilePath(scope: Scope, ctx: Pick<InstallContext, "cwd" | "home">): string {
  const base = scope === "project" ? ctx.cwd : ctx.home;
  return path.join(base, ".agents", LOCKFILE_NAME);
}

export async function readLockfile(scope: Scope, ctx: Pick<InstallContext, "cwd" | "home">): Promise<Lockfile> {
  const file = lockfilePath(scope, ctx);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLockfile();
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new InvalidLockfileError(file, `not valid JSON (${(err as Error).message})`);
  }
  const parsed = LockfileSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidLockfileError(file, z.prettifyError(parsed.error));
  return parsed.data;
}

export async function writeLockfile(scope: Scope, ctx: Pick<InstallContext, "cwd" | "home">, lock: Lockfile): Promise<void> {
  const file = lockfilePath(scope, ctx);
  await mkdir(path.dirname(file), { recursive: true });
  const sorted: Lockfile = { version: 1, skills: Object.fromEntries(Object.entries(lock.skills).sort(([a], [b]) => a.localeCompare(b))) };
  await writeFile(file, JSON.stringify(sorted, null, 2) + "\n", "utf8");
}
