import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const scriptsDir = path.join(repoRoot, "packages", "skills", "skills", "development", "bdd", "scripts");
const sandboxes: string[] = [];

type PreflightReport = {
  agents: Partial<Record<"claude" | "codex", { status: string; missing: string[]; problems: string[] }>>;
};

async function sandbox(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "bdd-scripts-"));
  sandboxes.push(root);
  await mkdir(path.join(root, "specs"), { recursive: true });
  return root;
}

async function writeHarness(
  root: string,
  agents: Array<"claude" | "codex">,
  config: object = {
    specsDir: "specs",
    testGlobs: ["**/*.test.ts"],
    ignoreDirs: ["node_modules"],
    pyramidTags: ["unit"],
    modifierTags: ["regression", "unimplemented"],
    unimplementedTag: "unimplemented",
    phrasingBanlist: [],
  },
): Promise<void> {
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "docs", "TESTING_PHILOSOPHY.md"), "# Testing\n");
  for (const agent of agents) {
    const dir = agent === "claude" ? ".claude" : ".agents";
    await mkdir(path.join(root, dir), { recursive: true });
    await writeFile(path.join(root, dir, "bdd.config.json"), JSON.stringify(config, null, 2) + "\n");
  }
}

function run(root: string, script: string, args: string[] = []) {
  return spawnSync(process.execPath, [path.join(scriptsDir, script), ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("BDD validation scripts", () => {
  /** Preflight reports every missing harness artifact per agent without changing the project. */
  it("reports an incomplete harness per agent", async () => {
    const root = await sandbox();

    const result = run(root, "bdd-preflight.mjs", ["--agent", "both"]);
    const report = JSON.parse(result.stdout) as PreflightReport;

    expect(result.status).toBe(1);
    expect(report.agents.claude?.status).toBe("incomplete");
    expect(report.agents.claude?.missing).toEqual(expect.arrayContaining(["docs/TESTING_PHILOSOPHY.md", ".claude/bdd.config.json"]));
    expect(report.agents.claude?.missing).not.toContain(".agents/bdd.config.json");
    expect(report.agents.codex?.status).toBe("incomplete");
    expect(report.agents.codex?.missing).toEqual(expect.arrayContaining(["docs/TESTING_PHILOSOPHY.md", ".agents/bdd.config.json"]));
    expect(report.agents.codex?.missing).not.toContain(".claude/bdd.config.json");
  });

  /** One agent's missing config does not make the other agent's harness incomplete. */
  it("reports one agent complete while the other is incomplete", async () => {
    const root = await sandbox();
    await writeHarness(root, ["claude"]);

    const result = run(root, "bdd-preflight.mjs", ["--agent", "both"]);
    const report = JSON.parse(result.stdout) as PreflightReport;

    expect(result.status).toBe(1);
    expect(report.agents.claude).toEqual({ status: "complete", missing: [], problems: [] });
    expect(report.agents.codex).toEqual({ status: "incomplete", missing: [".agents/bdd.config.json"], problems: [] });
  });

  /** An unparseable config is reported as invalid only for the agent that owns it. */
  it("reports an invalid config only for its owner", async () => {
    const root = await sandbox();
    await writeHarness(root, ["claude", "codex"]);
    await writeFile(path.join(root, ".agents", "bdd.config.json"), "{ not json\n");

    const result = run(root, "bdd-preflight.mjs", ["--agent", "both"]);
    const report = JSON.parse(result.stdout) as PreflightReport;

    expect(result.status).toBe(2);
    expect(report.agents.claude?.status).toBe("complete");
    expect(report.agents.codex?.status).toBe("invalid");
    expect(report.agents.codex?.problems[0]).toMatch(/^\.agents\/bdd\.config\.json: invalid JSON/);
  });

  /** Asking for one agent returns only that agent's entry, unwrapped, with that agent's exit code. */
  it("reports a single agent when --agent names it", async () => {
    const root = await sandbox();
    await writeHarness(root, ["claude"]);

    const claude = run(root, "bdd-preflight.mjs", ["--agent", "claude"]);
    const codex = run(root, "bdd-preflight.mjs", ["--agent", "codex"]);

    expect(claude.status).toBe(0);
    expect(JSON.parse(claude.stdout)).toEqual({ claude: { status: "complete", missing: [], problems: [] } });
    expect(codex.status).toBe(1);
    expect(JSON.parse(codex.stdout)).toEqual({ codex: { status: "incomplete", missing: [".agents/bdd.config.json"], problems: [] } });
  });

  /** An unknown agent name is rejected instead of silently falling back to detection. */
  it("rejects an unknown --agent value", async () => {
    const root = await sandbox();

    const result = run(root, "bdd-preflight.mjs", ["--agent", "cursor"]);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('unknown agent "cursor"');
  });

  /** Valid agent configs make the initialized harness complete for both agents. */
  it("accepts Claude and Codex configs", async () => {
    const root = await sandbox();
    await writeHarness(root, ["claude", "codex"]);

    const result = run(root, "bdd-preflight.mjs", ["--agent", "both"]);

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      agents: {
        claude: { status: "complete", missing: [], problems: [] },
        codex: { status: "complete", missing: [], problems: [] },
      },
    });
  });

  /** Each agent owns its config, so differing valid values are accepted. */
  it("accepts different Claude and Codex configs", async () => {
    const root = await sandbox();
    await writeHarness(root, ["claude", "codex"]);
    await writeHarness(root, ["codex"], {
      specsDir: "features",
      testGlobs: ["**/*.spec.ts"],
      ignoreDirs: ["vendor"],
      pyramidTags: ["integration"],
      modifierTags: ["regression", "unimplemented"],
      unimplementedTag: "unimplemented",
      phrasingBanlist: [],
    });

    const result = run(root, "bdd-preflight.mjs", ["--agent", "both"]);
    const report = JSON.parse(result.stdout) as PreflightReport;

    expect(result.status).toBe(0);
    expect(report.agents.claude?.status).toBe("complete");
    expect(report.agents.codex?.status).toBe("complete");
  });

  /** A comment that is not attached to a test cannot satisfy scenario parity. */
  it("does not count stray scenario comments as test bindings", async () => {
    const root = await sandbox();
    await writeFile(path.join(root, "specs", "example.feature"), "Feature: Example\n\n@unit\nScenario: Bound behavior\n  Given a state\n  When an action happens\n  Then an outcome is visible\n");
    await writeFile(path.join(root, "example.test.ts"), '// @scenario "Bound behavior"\nconst note = "not a test";\n');

    const result = run(root, "bdd-parity.mjs");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("UNBOUND (1)");
  });

  /** A scenario annotation immediately above a real test remains a valid binding. */
  it("counts a test JSDoc scenario annotation as a binding", async () => {
    const root = await sandbox();
    await writeFile(path.join(root, "specs", "example.feature"), "Feature: Example\n\n@unit\nScenario: Bound behavior\n  Given a state\n  When an action happens\n  Then an outcome is visible\n");
    await writeFile(path.join(root, "example.test.ts"), '/** @scenario "Bound behavior" */\nit("preserves the behavior", () => {});\n');

    const result = run(root, "bdd-parity.mjs");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("parity ok");
  });

  /** A bound scenario still tagged @unimplemented is in progress, not a parity gap. */
  it("treats a bound @unimplemented scenario as in progress", async () => {
    const root = await sandbox();
    await writeFile(path.join(root, "specs", "example.feature"), "Feature: Example\n\n@unit @unimplemented\nScenario: Bound behavior\n  Given a state\n  When an action happens\n  Then an outcome is visible\n");
    await writeFile(path.join(root, "example.test.ts"), '/** @scenario "Bound behavior" */\nit("preserves the behavior", () => {});\n');

    const result = run(root, "bdd-parity.mjs");
    const json = run(root, "bdd-parity.mjs", ["--json"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("IN PROGRESS (1)");
    expect(result.stdout).toContain("parity ok");
    expect(JSON.parse(json.stdout)).toMatchObject({ inProgress: [{ title: "Bound behavior" }], unbound: [], orphan: [] });
  });

  /** Checking one feature still detects a title duplicated in another feature. */
  it("detects duplicate scenario titles outside the requested file", async () => {
    const root = await sandbox();
    const feature = "Feature: Example\n\n@unit\nScenario: Duplicate behavior\n  Given a state\n  When an action happens\n  Then an outcome is visible\n";
    await mkdir(path.join(root, "specs", "other"), { recursive: true });
    await writeFile(path.join(root, "specs", "first.feature"), feature);
    await writeFile(path.join(root, "specs", "other", "second.feature"), feature);

    const result = run(root, "check-feature.mjs", ["specs/other/second.feature"]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('duplicate scenario title "Duplicate behavior"');
  });
});
