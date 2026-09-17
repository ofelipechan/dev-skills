import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { install, update, remove, listInstalled } from "../src/services/installer.js";
import { readLockfile } from "../src/services/lockfile.js";
import { NotManagedError } from "../src/services/errors.js";
import { makeSandbox, writeSkill, regenerateRegistry, exists, isSymlink, isRealDir, readText, type Sandbox } from "./helpers.js";

let sb: Sandbox;
beforeEach(async () => {
  sb = await makeSandbox();
});
afterEach(() => sb.cleanup());

async function publishBddV2(): Promise<void> {
  await writeSkill(sb.catalog, "testing/bdd", { "SKILL.md": "---\nname: bdd\ndescription: Behaviour-driven workflow.\n---\n\n# BDD v2\n" });
  await regenerateRegistry(sb.catalog);
}

describe("update()", () => {
  /** Nothing changes when the registry hash equals the installed hash. */
  it("reports up to date when hashes match", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    const result = await update({ scope: "project" }, sb.ctx);
    expect(result).toMatchObject({ updated: [], upToDate: ["bdd"], modified: [], missing: [] });
  });

  /** In copy mode every agent copy is refreshed. */
  it("updates every managed copy in copy mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "copy" }, sb.ctx);
    await publishBddV2();
    const result = await update({ scope: "project" }, sb.ctx);
    expect(result.updated).toEqual(["bdd"]);
    expect(await readText(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"))).toContain("# BDD v2");
    expect(await readText(path.join(sb.project, ".agents", "skills", "bdd", "SKILL.md"))).toContain("# BDD v2");
  });

  /** In symlink mode only the canonical copy is rewritten; links stay links. */
  it("updates only the canonical copy in symlink mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "symlink" }, sb.ctx);
    await publishBddV2();
    await update({ scope: "project" }, sb.ctx);
    const claude = path.join(sb.project, ".claude", "skills", "bdd");
    expect(await isSymlink(claude)).toBe(true);
    expect(await readText(path.join(claude, "SKILL.md"))).toContain("# BDD v2");
    expect(await isRealDir(path.join(sb.project, ".agents", "skills", "bdd"))).toBe(true);
  });

  /** The lockfile hash follows the update so the next run is up to date. */
  it("stores the new hash in the lockfile", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await publishBddV2();
    await update({ scope: "project" }, sb.ctx);
    const registry = await sb.ctx.source.getRegistry();
    expect((await readLockfile("project", sb.ctx)).skills["bdd"]?.hash).toBe(registry.skills.find((s) => s.name === "bdd")!.hash);
    expect((await update({ scope: "project" }, sb.ctx)).upToDate).toEqual(["bdd"]);
  });

  /** Local edits are never clobbered without an explicit force. */
  it("skips a locally modified skill and reports it", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    const local = path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md");
    await writeFile(local, "my local edit\n", "utf8");
    await publishBddV2();
    const result = await update({ scope: "project" }, sb.ctx);
    expect(result.modified).toEqual(["bdd"]);
    expect(result.updated).toEqual([]);
    expect(await readText(local)).toBe("my local edit\n");
  });

  /** A forced update overwrites local edits. */
  it("overwrites a locally modified skill when forced", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeFile(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"), "my local edit\n", "utf8");
    await publishBddV2();
    const result = await update({ scope: "project", force: true }, sb.ctx);
    expect(result.updated).toEqual(["bdd"]);
    expect(await readText(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"))).toContain("# BDD v2");
  });

  /** A modified canonical copy in symlink mode is detected the same way. */
  it("detects modification of the canonical copy in symlink mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "symlink" }, sb.ctx);
    await writeFile(path.join(sb.project, ".agents", "skills", "bdd", "SKILL.md"), "edited\n", "utf8");
    await publishBddV2();
    expect((await update({ scope: "project" }, sb.ctx)).modified).toEqual(["bdd"]);
  });

  /** Restricting to named skills leaves the others untouched. */
  it("updates only the requested skills", async () => {
    await install({ skills: ["bdd", "code-review"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await publishBddV2();
    await writeSkill(sb.catalog, "development/code-review", { "SKILL.md": "---\nname: code-review\ndescription: Review diffs.\n---\n\n# v2\n" });
    await regenerateRegistry(sb.catalog);
    const result = await update({ scope: "project", skills: ["code-review"] }, sb.ctx);
    expect(result.updated).toEqual(["code-review"]);
    expect(await readText(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"))).not.toContain("v2");
  });

  /** A skill removed from the registry is reported, not deleted. */
  it("reports a locked skill that the registry no longer has", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeFile(path.join(sb.catalog, "registry.json"), JSON.stringify({ version: 1, skills: [] }), "utf8");
    const result = await update({ scope: "project" }, sb.ctx);
    expect(result.missing).toEqual(["bdd"]);
    expect(await exists(path.join(sb.project, ".claude", "skills", "bdd"))).toBe(true);
  });
});

describe("remove()", () => {
  /** Copy mode deletes each agent's copy listed in the lockfile. */
  it("removes every agent copy in copy mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "copy" }, sb.ctx);
    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);
    expect(result.removed.map((t) => t.agent)).toEqual(["claude-code", "codex"]);
    expect(await exists(path.join(sb.project, ".claude", "skills", "bdd"))).toBe(false);
    expect(await exists(path.join(sb.project, ".agents", "skills", "bdd"))).toBe(false);
    expect((await readLockfile("project", sb.ctx)).skills["bdd"]).toBeUndefined();
  });

  /** Symlink mode unlinks each agent and then drops the canonical copy nobody references. */
  it("unlinks agents and removes the canonical copy in symlink mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "symlink" }, sb.ctx);
    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);
    expect(await exists(path.join(sb.project, ".claude", "skills", "bdd"))).toBe(false);
    expect(await exists(path.join(sb.project, ".agents", "skills", "bdd"))).toBe(false);
    expect(result.canonicalRemoved).toEqual([path.join(sb.project, ".agents", "skills", "bdd")]);
  });

  /** Unlinking never follows the link into the canonical content. */
  it("removes the link, not the linked content, when another skill is untouched", async () => {
    await install({ skills: ["bdd", "code-review"], agents: ["claude-code"], scope: "project", strategy: "symlink" }, sb.ctx);
    await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);
    expect(await exists(path.join(sb.project, ".agents", "skills", "code-review", "SKILL.md"))).toBe(true);
    expect(await isSymlink(path.join(sb.project, ".claude", "skills", "code-review"))).toBe(true);
  });

  /** Directories that merely look like skills are never deleted. */
  it("is rejected for a skill that is not in the lockfile", async () => {
    const stray = path.join(sb.project, ".claude", "skills", "bdd");
    await mkdir(stray, { recursive: true });
    await writeFile(path.join(stray, "SKILL.md"), "mine\n", "utf8");
    await expect(remove({ skills: ["bdd"], scope: "project" }, sb.ctx)).rejects.toBeInstanceOf(NotManagedError);
    expect(await exists(stray)).toBe(true);
  });

  /** Global removals act on the home directories and the global lockfile. */
  it("removes a global install", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "global", strategy: "copy" }, sb.ctx);
    await remove({ skills: ["bdd"], scope: "global" }, sb.ctx);
    expect(await exists(path.join(sb.home, ".claude", "skills", "bdd"))).toBe(false);
    expect((await readLockfile("global", sb.ctx)).skills["bdd"]).toBeUndefined();
  });
});

describe("listInstalled()", () => {
  /** Both scopes are reported with their update status. */
  it("lists project and global installs and flags available updates", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await install({ skills: ["code-review"], agents: ["codex"], scope: "global", strategy: "symlink" }, sb.ctx);
    await publishBddV2();
    const list = await listInstalled(sb.ctx);
    expect(list.map((s) => [s.name, s.scope, s.updateAvailable])).toEqual([
      ["bdd", "project", true],
      ["code-review", "global", false],
    ]);
  });

  /** Nothing installed is an empty list, not an error. */
  it("returns an empty list when nothing is installed", async () => {
    expect(await listInstalled(sb.ctx)).toEqual([]);
  });
});
