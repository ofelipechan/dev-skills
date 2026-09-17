import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, symlink, rm } from "node:fs/promises";
import path from "node:path";
import { install } from "../src/services/installer.js";
import { readLockfile } from "../src/services/lockfile.js";
import { DestinationExistsError, SkillNotFoundError, UnsupportedAgentError, SymlinkError } from "../src/services/errors.js";
import { makeSandbox, exists, isSymlink, isRealDir, linkTarget, readText, type Sandbox } from "./helpers.js";
import type { InstallRequest } from "../src/services/types.js";

let sb: Sandbox;
beforeEach(async () => {
  sb = await makeSandbox();
});
afterEach(() => sb.cleanup());

const req = (over: Partial<InstallRequest> = {}): InstallRequest => ({
  skills: ["bdd"],
  agents: ["claude-code"],
  scope: "project",
  strategy: "copy",
  ...over,
});

describe("install()", () => {
  describe("copy strategy", () => {
    /** A project copy for Claude Code lands in .claude/skills with the whole directory. */
    it("copies the whole skill directory into the project Claude Code dir", async () => {
      const result = await install(req(), sb.ctx);
      const dest = path.join(sb.project, ".claude", "skills", "bdd");
      expect(result.installed).toEqual([{ skill: "bdd", agent: "claude-code", path: dest, strategy: "copy" }]);
      expect(await isRealDir(dest)).toBe(true);
      expect(await exists(path.join(dest, "references", "philosophy.md"))).toBe(true);
      expect(await exists(path.join(dest, "scripts", "check.mjs"))).toBe(true);
    });

    /** A global copy for Codex lands in ~/.agents/skills. */
    it("copies into the global Codex dir", async () => {
      await install(req({ agents: ["codex"], scope: "global" }), sb.ctx);
      expect(await isRealDir(path.join(sb.home, ".agents", "skills", "bdd"))).toBe(true);
      expect(await exists(path.join(sb.project, ".agents"))).toBe(false);
    });

    /** Two agents get two independent copies. */
    it("creates independent copies for Claude Code and Codex", async () => {
      await install(req({ agents: ["claude-code", "codex"] }), sb.ctx);
      const claude = path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md");
      const codex = path.join(sb.project, ".agents", "skills", "bdd", "SKILL.md");
      expect(await isRealDir(path.dirname(claude))).toBe(true);
      expect(await isRealDir(path.dirname(codex))).toBe(true);
      await writeFile(claude, "edited\n", "utf8");
      expect(await readText(codex)).not.toBe("edited\n");
    });

    /** Several skills install in one request. */
    it("installs multiple skills", async () => {
      const result = await install(req({ skills: ["bdd", "code-review", "system-design"] }), sb.ctx);
      expect(result.installed.map((t) => t.skill)).toEqual(["bdd", "code-review", "system-design"]);
      expect(await exists(path.join(sb.project, ".claude", "skills", "system-design", "assets", "diagram.txt"))).toBe(true);
    });

    /** The lockfile records what was installed, where, and from which content. */
    it("records the install in the project lockfile", async () => {
      await install(req({ agents: ["claude-code", "codex"] }), sb.ctx);
      const lock = await readLockfile("project", sb.ctx);
      const registry = await sb.ctx.source.getRegistry();
      const bdd = registry.skills.find((s) => s.name === "bdd")!;
      expect(lock.skills["bdd"]).toMatchObject({ hash: bdd.hash, agents: ["claude-code", "codex"], scope: "project", strategy: "copy" });
      expect(await exists(path.join(sb.home, ".agents", "skills-lock.json"))).toBe(false);
    });

    /** Global installs are tracked in the global lockfile only. */
    it("records a global install in the global lockfile", async () => {
      await install(req({ scope: "global" }), sb.ctx);
      expect((await readLockfile("global", sb.ctx)).skills["bdd"]?.scope).toBe("global");
      expect(await exists(path.join(sb.project, ".agents", "skills-lock.json"))).toBe(false);
    });
  });

  describe("symlink strategy", () => {
    /** One canonical copy in .agents/skills, Claude Code linked to it. */
    it("creates one canonical copy and links Claude Code to it (project)", async () => {
      const result = await install(req({ agents: ["claude-code", "codex"], strategy: "symlink" }), sb.ctx);
      const canonical = path.join(sb.project, ".agents", "skills", "bdd");
      const claude = path.join(sb.project, ".claude", "skills", "bdd");
      expect(result.canonical).toEqual([canonical]);
      expect(await isRealDir(canonical)).toBe(true);
      expect(await isSymlink(claude)).toBe(true);
      expect(await linkTarget(claude)).toBe(await linkTarget(canonical));
    });

    /** Codex reads .agents/skills natively, so it uses the canonical copy directly without a self-link. */
    it("does not link Codex onto its own directory", async () => {
      const result = await install(req({ agents: ["codex"], strategy: "symlink" }), sb.ctx);
      const canonical = path.join(sb.project, ".agents", "skills", "bdd");
      expect(await isRealDir(canonical)).toBe(true);
      expect(await isSymlink(canonical)).toBe(false);
      expect(result.installed).toEqual([{ skill: "bdd", agent: "codex", path: canonical, strategy: "symlink" }]);
    });

    /** Editing the canonical copy is visible through the link. */
    it("shares edits between agents through the canonical copy", async () => {
      await install(req({ agents: ["claude-code", "codex"], strategy: "symlink" }), sb.ctx);
      await writeFile(path.join(sb.project, ".agents", "skills", "bdd", "SKILL.md"), "shared\n", "utf8");
      expect(await readText(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"))).toBe("shared\n");
    });

    /** Global symlink installs use ~/.agents/skills as the canonical location. */
    it("uses the home canonical directory for global scope", async () => {
      await install(req({ agents: ["claude-code"], strategy: "symlink", scope: "global" }), sb.ctx);
      const canonical = path.join(sb.home, ".agents", "skills", "bdd");
      const claude = path.join(sb.home, ".claude", "skills", "bdd");
      expect(await isRealDir(canonical)).toBe(true);
      expect(await isSymlink(claude)).toBe(true);
      expect(await linkTarget(claude)).toBe(await linkTarget(canonical));
    });

    /** The lockfile remembers the strategy so update and remove act on the right paths. */
    it("records the symlink strategy in the lockfile", async () => {
      await install(req({ agents: ["claude-code"], strategy: "symlink" }), sb.ctx);
      expect((await readLockfile("project", sb.ctx)).skills["bdd"]?.strategy).toBe("symlink");
    });

    /** A dangling link left behind is replaced rather than treated as an obstacle. */
    it("replaces a broken symlink at the destination", async () => {
      const claudeDir = path.join(sb.project, ".claude", "skills");
      await mkdir(claudeDir, { recursive: true });
      const missing = path.join(sb.project, "does-not-exist");
      await symlink(missing, path.join(claudeDir, "bdd"), process.platform === "win32" ? "junction" : "dir");
      await install(req({ agents: ["claude-code"], strategy: "symlink" }), sb.ctx);
      expect(await readText(path.join(claudeDir, "bdd", "SKILL.md"))).toContain("# BDD");
    });

    /** When the OS refuses the link the caller gets a typed error and no half-install. */
    it("is rejected with a SymlinkError when linking fails", async () => {
      const failing = { ...sb.ctx, symlink: async () => { throw new Error("EPERM"); } };
      await expect(install(req({ agents: ["claude-code"], strategy: "symlink" }), failing)).rejects.toBeInstanceOf(SymlinkError);
      expect((await readLockfile("project", sb.ctx)).skills["bdd"]).toBeUndefined();
    });
  });

  describe("existing destination", () => {
    /** Unmanaged content is never overwritten silently. */
    it("is rejected when an unmanaged directory occupies the destination", async () => {
      const dest = path.join(sb.project, ".claude", "skills", "bdd");
      await mkdir(dest, { recursive: true });
      await writeFile(path.join(dest, "SKILL.md"), "mine\n", "utf8");
      await expect(install(req(), sb.ctx)).rejects.toBeInstanceOf(DestinationExistsError);
      expect(await readText(path.join(dest, "SKILL.md"))).toBe("mine\n");
    });

    /** With --force the unmanaged directory is replaced. */
    it("overwrites an unmanaged destination when forced", async () => {
      const dest = path.join(sb.project, ".claude", "skills", "bdd");
      await mkdir(dest, { recursive: true });
      await writeFile(path.join(dest, "SKILL.md"), "mine\n", "utf8");
      await install(req({ force: true }), sb.ctx);
      expect(await readText(path.join(dest, "SKILL.md"))).toContain("# BDD");
    });

    /** Reinstalling a managed skill is a refresh, not a conflict. */
    it("reinstalls a skill that the lockfile already manages", async () => {
      await install(req(), sb.ctx);
      await writeFile(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"), "edited\n", "utf8");
      await install(req(), sb.ctx);
      expect(await readText(path.join(sb.project, ".claude", "skills", "bdd", "SKILL.md"))).toContain("# BDD");
    });

    /** Adding an agent to an installed skill extends the lockfile entry instead of replacing it. */
    it("adds an agent to an existing install", async () => {
      await install(req({ agents: ["claude-code"] }), sb.ctx);
      await install(req({ agents: ["codex"] }), sb.ctx);
      expect((await readLockfile("project", sb.ctx)).skills["bdd"]?.agents).toEqual(["claude-code", "codex"]);
    });
  });

  describe("validation", () => {
    /** Unknown skills fail before anything is written. */
    it("is rejected for an unknown skill and writes nothing", async () => {
      await expect(install(req({ skills: ["bdd", "nope"] }), sb.ctx)).rejects.toBeInstanceOf(SkillNotFoundError);
      expect(await exists(path.join(sb.project, ".claude"))).toBe(false);
    });

    /** Unknown agents fail before anything is written. */
    it("is rejected for an unsupported agent", async () => {
      await expect(install(req({ agents: ["cursor" as never] }), sb.ctx)).rejects.toBeInstanceOf(UnsupportedAgentError);
      expect(await exists(path.join(sb.project, ".claude"))).toBe(false);
    });

    /** A request with no skills or no agents is meaningless. */
    it("is rejected when skills or agents are empty", async () => {
      await expect(install(req({ skills: [] }), sb.ctx)).rejects.toThrow();
      await expect(install(req({ agents: [] }), sb.ctx)).rejects.toThrow();
    });
  });

  /** The sandbox never touches the developer's real home directory. */
  it("writes only inside the injected cwd and home", async () => {
    await install(req({ agents: ["claude-code", "codex"], scope: "global", strategy: "symlink" }), sb.ctx);
    expect(await exists(path.join(sb.home, ".agents", "skills", "bdd"))).toBe(true);
    await rm(sb.home, { recursive: true, force: true });
    expect(await exists(sb.home)).toBe(false);
  });
});
