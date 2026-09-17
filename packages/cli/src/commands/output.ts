/** Plain-text presentation for non-interactive commands. No filesystem access here. */
import path from "node:path";
import { getAgent } from "../services/agents.js";
import { DevSkillsError } from "../services/errors.js";
import type { InstallRequest, InstallResult, InstalledSkill, Registry, RemoveResult, UpdateResult } from "../services/types.js";

const out = (line = ""): void => {
  process.stdout.write(line + "\n");
};

export function relative(p: string): string {
  const rel = path.relative(process.cwd(), p);
  return rel && !rel.startsWith("..") ? rel : p;
}

export function printInstallResult(req: InstallRequest, result: InstallResult): void {
  out(`Installed ${req.skills.length} skill(s) [${req.scope}, ${req.strategy}]`);
  for (const t of result.installed) out(`  ${t.skill.padEnd(20)} ${getAgent(t.agent).name.padEnd(14)} ${relative(t.path)}`);
  if (result.canonical.length) out(`  canonical: ${result.canonical.map(relative).join(", ")}`);
}

export function printUpdateResult(result: UpdateResult): void {
  if (result.updated.length) out(`Updated: ${result.updated.join(", ")}`);
  if (result.upToDate.length) out(`Up to date: ${result.upToDate.join(", ")}`);
  if (result.modified.length) out(`Skipped (locally modified, use --force to overwrite): ${result.modified.join(", ")}`);
  if (result.missing.length) out(`Not in registry anymore: ${result.missing.join(", ")}`);
  if (!result.updated.length && !result.upToDate.length && !result.modified.length && !result.missing.length) out("Nothing installed.");
}

export function printRemoveResult(result: RemoveResult): void {
  for (const t of result.removed) out(`Removed ${t.skill.padEnd(20)} ${getAgent(t.agent).name.padEnd(14)} ${relative(t.path)}`);
  for (const c of result.canonicalRemoved) out(`Removed canonical ${relative(c)}`);
}

export function printAvailable(registry: Registry, installed: InstalledSkill[]): void {
  out("Available skills:");
  for (const s of registry.skills) {
    const marks = installed.filter((i) => i.name === s.name).map((i) => i.scope + (i.updateAvailable ? "*" : ""));
    const tag = marks.length ? ` [installed: ${marks.join(", ")}]` : "";
    out(`  ${s.name.padEnd(20)} ${s.category.padEnd(14)} ${s.description}${tag}`);
  }
  if (installed.some((i) => i.updateAvailable)) out("\n* update available (run: dev-skills update)");
}

export function printInstalled(installed: InstalledSkill[]): void {
  if (!installed.length) {
    out("No skills installed.");
    return;
  }
  out("Installed skills:");
  for (const i of installed) {
    const agents = i.entry.agents.map((a) => getAgent(a).name).join(", ");
    out(`  ${i.name.padEnd(20)} ${i.scope.padEnd(8)} ${i.entry.strategy.padEnd(8)} ${agents}${i.updateAvailable ? "  (update available)" : ""}`);
  }
}

export function printError(err: unknown): void {
  const msg = err instanceof DevSkillsError ? `${err.message} [${err.code}]` : err instanceof Error ? err.message : String(err);
  process.stderr.write(`error: ${msg}\n`);
}
