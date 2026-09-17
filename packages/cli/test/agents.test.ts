import { describe, it, expect } from "vitest";
import path from "node:path";
import { getAgent, listAgents, isAgentId, resolveAgentSkillsDir, resolveCanonicalSkillsDir } from "../src/services/agents.js";
import { UnsupportedAgentError } from "../src/services/errors.js";
import type { InstallContext } from "../src/services/types.js";

const ctx = { cwd: path.join("/tmp", "proj"), home: path.join("/tmp", "home") } as InstallContext;

describe("agents registry", () => {
  /** Both first-class agents are available to the wizard and the CLI. */
  it("lists Claude Code and Codex", () => {
    expect(listAgents().map((a) => a.id)).toEqual(["claude-code", "codex"]);
  });

  /** An unknown agent id is an explicit error, never a silent default. */
  it("is rejected for an unsupported agent id", () => {
    expect(() => getAgent("cursor" as never)).toThrow(UnsupportedAgentError);
    expect(isAgentId("cursor")).toBe(false);
    expect(isAgentId("codex")).toBe(true);
  });

  /** Claude Code discovers project skills in .claude/skills and personal skills in ~/.claude/skills. */
  it("resolves Claude Code directories per scope", () => {
    const claude = getAgent("claude-code");
    expect(resolveAgentSkillsDir(claude, "project", ctx)).toBe(path.join(ctx.cwd, ".claude", "skills"));
    expect(resolveAgentSkillsDir(claude, "global", ctx)).toBe(path.join(ctx.home, ".claude", "skills"));
  });

  /** Codex discovers skills in .agents/skills (repo) and ~/.agents/skills (user). */
  it("resolves Codex directories per scope", () => {
    const codex = getAgent("codex");
    expect(resolveAgentSkillsDir(codex, "project", ctx)).toBe(path.join(ctx.cwd, ".agents", "skills"));
    expect(resolveAgentSkillsDir(codex, "global", ctx)).toBe(path.join(ctx.home, ".agents", "skills"));
  });

  /** The canonical (shared) directory is the agent-neutral .agents/skills. */
  it("resolves the canonical directory per scope", () => {
    expect(resolveCanonicalSkillsDir("project", ctx)).toBe(path.join(ctx.cwd, ".agents", "skills"));
    expect(resolveCanonicalSkillsDir("global", ctx)).toBe(path.join(ctx.home, ".agents", "skills"));
  });
});
