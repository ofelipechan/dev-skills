/**
 * Harness cleanup: files a skill's own setup step creates outside its folder
 * (hooks, rules, config) and the settings entries that run them.
 * The skill declares them in `harness.json`; nothing undeclared is touched.
 * Several skills may declare the same file (shared config); it is removed with the last of them.
 * Never prompts or prints.
 */
import { readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { resolveAgentHarnessDir } from "./agents.js";
import { InvalidHarnessError, InvalidSettingsError } from "./errors.js";
import { pathKind, removePath } from "./fs-utils.js";
import type { AgentConfig, InstallContext, Scope } from "./types.js";

export const HARNESS_FILE = "harness.json";

const HarnessPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.includes("\\") && !/^[a-zA-Z]:/.test(p) && !p.split("/").includes(".."), {
    message: "must be a relative POSIX path inside the agent dir",
  });

const HarnessSchema = z.object({
  /** Paths relative to the agent's harness dir, e.g. `hooks/bdd-hook.mjs`. */
  files: z.array(HarnessPathSchema),
});

export type Harness = z.infer<typeof HarnessSchema>;

/** Read `harness.json` from an installed skill dir; undefined when the skill has none. */
export async function readHarness(skill: string, skillDir: string): Promise<Harness | undefined> {
  const file = path.join(skillDir, HARNESS_FILE);
  if ((await pathKind(file)) !== "file") return undefined;
  let data: unknown;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    throw new InvalidHarnessError(skill, (err as Error).message);
  }
  const parsed = HarnessSchema.safeParse(data);
  if (!parsed.success) throw new InvalidHarnessError(skill, z.prettifyError(parsed.error));
  return parsed.data;
}

interface HookCommand { command?: unknown }
interface HookGroup { hooks?: HookCommand[] }
type Settings = { hooks?: Record<string, HookGroup[]> } & Record<string, unknown>;

/** Drop hook commands that run any of `needles`; groups and events left empty go with them. */
export function stripHooks(settings: Settings, needles: string[]): boolean {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return false;
  const runsHarness = (h: HookCommand) => typeof h?.command === "string" && needles.some((n) => (h.command as string).includes(n));
  let changed = false;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept: HookGroup[] = [];
    for (const group of groups) {
      if (!Array.isArray(group?.hooks)) {
        kept.push(group);
        continue;
      }
      const inner = group.hooks.filter((h) => !runsHarness(h));
      if (inner.length === group.hooks.length) {
        kept.push(group);
        continue;
      }
      changed = true;
      if (inner.length > 0) kept.push({ ...group, hooks: inner });
    }
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (changed && Object.keys(hooks).length === 0) delete settings.hooks;
  return changed;
}

export interface HarnessPlan {
  root: string;
  files: string[];
  settings?: { file: string; next: Settings };
}

/** Work out what to delete and rewrite for one agent. Reads only, so callers can fail before writing. */
export async function planHarnessRemoval(
  harness: Harness,
  agent: AgentConfig,
  scope: Scope,
  ctx: Pick<InstallContext, "cwd" | "home">,
): Promise<HarnessPlan> {
  const root = resolveAgentHarnessDir(agent, scope, ctx);
  const files: string[] = [];
  // Only regular files: a link or directory at a declared path is not ours.
  for (const rel of harness.files) {
    const full = path.join(root, ...rel.split("/"));
    if ((await pathKind(full)) === "file") files.push(full);
  }

  const plan: HarnessPlan = { root, files };
  if (!agent.settingsFile) return plan;
  const settingsPath = path.join(root, agent.settingsFile);
  if ((await pathKind(settingsPath)) !== "file") return plan;
  let settings: unknown;
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf8"));
  } catch (err) {
    throw new InvalidSettingsError(settingsPath, (err as Error).message);
  }
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    throw new InvalidSettingsError(settingsPath, "expected a JSON object");
  }
  // Commands reference harness files as `<agent dir>/<file>`, e.g. `.claude/hooks/bdd-hook.mjs`.
  const dirName = path.basename(root);
  const next = settings as Settings;
  if (stripHooks(next, harness.files.map((f) => `${dirName}/${f}`))) plan.settings = { file: settingsPath, next };
  return plan;
}

/** Apply a plan: delete its files (and parent dirs left empty), rewrite settings if they changed. */
export async function applyHarnessRemoval(plan: HarnessPlan): Promise<{ removed: string[]; settings?: string }> {
  for (const file of plan.files) {
    await removePath(file);
    await pruneEmptyDirs(path.dirname(file), plan.root);
  }
  if (!plan.settings) return { removed: plan.files };
  await writeFile(plan.settings.file, JSON.stringify(plan.settings.next, null, 2) + "\n", "utf8");
  return { removed: plan.files, settings: plan.settings.file };
}

/** Remove `dir` and its parents while empty, never `stopAt` itself or anything outside it. */
async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  let current = dir;
  for (;;) {
    const rel = path.relative(stopAt, current);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    if ((await pathKind(current)) !== "directory" || (await readdir(current)).length > 0) return;
    await rmdir(current);
    current = path.dirname(current);
  }
}
