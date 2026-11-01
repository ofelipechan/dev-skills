import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { install, remove } from "../src/services/installer.js";
import { readLockfile } from "../src/services/lockfile.js";
import { readHarness, stripHooks } from "../src/services/harness.js";
import { InvalidHarnessError, InvalidSettingsError } from "../src/services/errors.js";
import { makeSandbox, writeSkill, regenerateRegistry, exists, readJson, type Sandbox } from "./helpers.js";

let sb: Sandbox;
beforeEach(async () => {
  sb = await makeSandbox();
  await publishBddWithHarness(["hooks/bdd-hook.mjs", "rules/bdd-spec.md", "bdd.config.json"]);
});
afterEach(() => sb.cleanup());

async function publishBddWithHarness(files: string[]): Promise<void> {
  await writeSkill(sb.catalog, "testing/bdd", { "harness.json": JSON.stringify({ files }) });
  await regenerateRegistry(sb.catalog);
}

/** Simulate what the skill's own init step writes into an agent dir. */
async function writeHarnessFiles(agentDir: string, files: string[]): Promise<void> {
  for (const rel of files) {
    const full = path.join(sb.project, agentDir, ...rel.split("/"));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, "x\n", "utf8");
  }
}

const hookCmd = (file: string) => ({ type: "command", command: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}" --hook` });

async function writeSettings(settings: unknown): Promise<string> {
  const file = path.join(sb.project, ".claude", "settings.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof settings === "string" ? settings : JSON.stringify(settings, null, 2), "utf8");
  return file;
}

describe("remove() harness cleanup", () => {
  /** Files the skill declares in harness.json are deleted from every agent dir in the lockfile. */
  it("deletes declared harness files for each agent", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs", "rules/bdd-spec.md", "bdd.config.json"]);
    await writeHarnessFiles(".agents", ["hooks/bdd-hook.mjs", "bdd.config.json"]);

    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(result.harnessRemoved).toHaveLength(5);
    expect(await exists(path.join(sb.project, ".claude", "hooks"))).toBe(false);
    expect(await exists(path.join(sb.project, ".claude", "rules"))).toBe(false);
    expect(await exists(path.join(sb.project, ".claude", "bdd.config.json"))).toBe(false);
    expect(await exists(path.join(sb.project, ".agents", "hooks", "bdd-hook.mjs"))).toBe(false);
    expect(await exists(path.join(sb.project, ".agents", "bdd.config.json"))).toBe(false);
  });

  /** Undeclared files beside harness files survive, and so do their directories. */
  it("keeps files the skill did not declare", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs", "hooks/mine.mjs"]);

    await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(await exists(path.join(sb.project, ".claude", "hooks", "bdd-hook.mjs"))).toBe(false);
    expect(await exists(path.join(sb.project, ".claude", "hooks", "mine.mjs"))).toBe(true);
  });

  /** Symlink installs read harness.json from the canonical copy before it is removed. */
  it("cleans the harness in symlink mode", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "symlink" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs"]);

    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(result.harnessRemoved).toEqual([path.join(sb.project, ".claude", "hooks", "bdd-hook.mjs")]);
  });

  /** Hook entries that run a declared file are stripped; unrelated hooks and settings stay. */
  it("strips only the skill's hook entries from Claude settings", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    const file = await writeSettings({
      permissions: { allow: ["Bash(npm test)"] },
      hooks: {
        PreToolUse: [{ matcher: "Write|Edit", hooks: [hookCmd("bdd-hook.mjs"), hookCmd("mine.mjs")] }],
        Stop: [{ hooks: [hookCmd("bdd-hook.mjs")] }],
      },
    });

    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(result.settingsUpdated).toEqual([file]);
    expect(await readJson(file)).toEqual({
      permissions: { allow: ["Bash(npm test)"] },
      hooks: { PreToolUse: [{ matcher: "Write|Edit", hooks: [hookCmd("mine.mjs")] }] },
    });
  });

  /** Settings without any of the skill's hooks are left byte-for-byte untouched. */
  it("does not rewrite settings it has nothing to strip from", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeSettings({ hooks: { Stop: [{ hooks: [hookCmd("mine.mjs")] }] } });

    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(result.settingsUpdated).toEqual([]);
  });

  /** A settings file that is not valid JSON aborts the removal before anything is deleted. */
  it("is rejected with nothing removed when settings are not valid JSON", async () => {
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs"]);
    await writeSettings("{ not json");

    await expect(remove({ skills: ["bdd"], scope: "project" }, sb.ctx)).rejects.toThrow(InvalidSettingsError);
    expect(await exists(path.join(sb.project, ".claude", "hooks", "bdd-hook.mjs"))).toBe(true);
    expect(await exists(path.join(sb.project, ".claude", "skills", "bdd"))).toBe(true);
    expect((await readLockfile("project", sb.ctx)).skills["bdd"]).toBeDefined();
  });

  /** A harness path that escapes the agent dir is refused, and nothing is removed. */
  it("is rejected for a harness path outside the agent dir", async () => {
    await publishBddWithHarness(["../package.json"]);
    await install({ skills: ["bdd"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeFile(path.join(sb.project, "package.json"), "{}\n", "utf8");

    await expect(remove({ skills: ["bdd"], scope: "project" }, sb.ctx)).rejects.toThrow(InvalidHarnessError);
    expect(await exists(path.join(sb.project, "package.json"))).toBe(true);
  });

  /** Skills without harness.json remove exactly as before. */
  it("reports no harness work for a skill without harness.json", async () => {
    await install({ skills: ["code-review"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs"]);

    const result = await remove({ skills: ["code-review"], scope: "project" }, sb.ctx);

    expect(result.harnessRemoved).toEqual([]);
    expect(await exists(path.join(sb.project, ".claude", "hooks", "bdd-hook.mjs"))).toBe(true);
  });
});

describe("remove() shared harness files", () => {
  beforeEach(async () => {
    await writeSkill(sb.catalog, "testing/bdd-plan", {
      "SKILL.md": "---\nname: bdd-plan\ndescription: Plan half.\n---\n\n# Plan\n",
      "harness.json": JSON.stringify({ files: ["bdd.config.json"] }),
    });
    await regenerateRegistry(sb.catalog);
    await install({ skills: ["bdd", "bdd-plan"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["hooks/bdd-hook.mjs", "bdd.config.json"]);
  });

  /** A partial removal keeps a file another installed skill still declares, but drops the rest. */
  it("keeps shared files while another declaring skill stays", async () => {
    const result = await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(result.harnessRemoved).toEqual([path.join(sb.project, ".claude", "hooks", "bdd-hook.mjs")]);
    expect(await exists(path.join(sb.project, ".claude", "bdd.config.json"))).toBe(true);
  });

  /** Removing the last declaring skill removes the shared file. */
  it("removes shared files with the last skill that declares them", async () => {
    await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);
    await remove({ skills: ["bdd-plan"], scope: "project" }, sb.ctx);

    expect(await exists(path.join(sb.project, ".claude", "bdd.config.json"))).toBe(false);
  });

  /** Removing every declaring skill in one call removes the shared file too. */
  it("removes shared files when all declaring skills go together", async () => {
    await remove({ skills: ["bdd", "bdd-plan"], scope: "project" }, sb.ctx);

    expect(await exists(path.join(sb.project, ".claude", "bdd.config.json"))).toBe(false);
    expect(await exists(path.join(sb.project, ".claude", "hooks"))).toBe(false);
  });

  /** A claim only protects the agent it is installed for. */
  it("removes a shared file for an agent the remaining skill is not installed for", async () => {
    await remove({ skills: ["bdd", "bdd-plan"], scope: "project" }, sb.ctx);
    await install({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "copy" }, sb.ctx);
    await install({ skills: ["bdd-plan"], agents: ["claude-code"], scope: "project", strategy: "copy" }, sb.ctx);
    await writeHarnessFiles(".claude", ["bdd.config.json"]);
    await writeHarnessFiles(".agents", ["bdd.config.json"]);

    await remove({ skills: ["bdd"], scope: "project" }, sb.ctx);

    expect(await exists(path.join(sb.project, ".claude", "bdd.config.json"))).toBe(true);
    expect(await exists(path.join(sb.project, ".agents", "bdd.config.json"))).toBe(false);
  });
});

describe("stripHooks()", () => {
  /** Removing the last hook of every event drops the hooks block entirely. */
  it("drops the hooks block once it is empty", () => {
    const settings = { model: "x", hooks: { Stop: [{ hooks: [hookCmd("bdd-parity.mjs")] }] } };
    expect(stripHooks(settings, [".claude/hooks/bdd-parity.mjs"])).toBe(true);
    expect(settings).toEqual({ model: "x" });
  });

  /** An empty hooks block the user wrote is not "changed" and stays. */
  it("leaves an already-empty hooks block alone", () => {
    const settings = { hooks: {} };
    expect(stripHooks(settings, [".claude/hooks/bdd-hook.mjs"])).toBe(false);
    expect(settings).toEqual({ hooks: {} });
  });
});

describe("bdd harness.json", () => {
  const bddDir = fileURLToPath(new URL("../../skills/skills/development/bdd", import.meta.url));

  /** Every runtime script init copies into hooks/ is declared, so remove leaves none behind. */
  it("declares every script the init step copies", async () => {
    const harness = await readHarness("bdd", bddDir);
    const scripts = (await readdir(path.join(bddDir, "scripts"))).filter((f) => f.startsWith("bdd-") || f.startsWith("check-"));
    const hooks = harness!.files.filter((f) => f.startsWith("hooks/")).map((f) => f.slice("hooks/".length));
    expect(hooks.sort()).toEqual(scripts.sort());
  });
});
