/**
 * The only place that knows where each agent looks for skills.
 * Adding an agent = adding one entry here.
 *
 * Sources (verified 2026-09):
 * - Claude Code: `.claude/skills/<name>/SKILL.md` (project), `~/.claude/skills/` (personal)
 * - Codex:       `.agents/skills/` (repo), `~/.agents/skills/` (user); follows symlinks
 */
import path from "node:path";
import { UnsupportedAgentError } from "./errors.js";
import type { AgentConfig, AgentId, InstallContext, Scope } from "./types.js";

const AGENTS: Record<AgentId, AgentConfig> = {
  "claude-code": {
    id: "claude-code",
    name: "Claude Code",
    projectSkillsDir: ".claude/skills",
    globalSkillsDir: "~/.claude/skills",
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex",
    projectSkillsDir: ".agents/skills",
    globalSkillsDir: "~/.agents/skills",
  },
};

/** Agent-neutral directory that holds the single copy in symlink mode. */
const CANONICAL: Record<Scope, string> = {
  project: ".agents/skills",
  global: "~/.agents/skills",
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export function listAgents(): AgentConfig[] {
  return AGENT_IDS.map((id) => AGENTS[id]);
}

export function isAgentId(value: string): value is AgentId {
  return Object.hasOwn(AGENTS, value);
}

export function getAgent(id: AgentId): AgentConfig {
  if (!isAgentId(id)) throw new UnsupportedAgentError(String(id), AGENT_IDS);
  return AGENTS[id];
}

function expand(dir: string, ctx: Pick<InstallContext, "cwd" | "home">): string {
  if (dir.startsWith("~/")) return path.join(ctx.home, dir.slice(2));
  return path.join(ctx.cwd, dir);
}

export function resolveAgentSkillsDir(agent: AgentConfig, scope: Scope, ctx: Pick<InstallContext, "cwd" | "home">): string {
  return expand(scope === "project" ? agent.projectSkillsDir : agent.globalSkillsDir, ctx);
}

export function resolveCanonicalSkillsDir(scope: Scope, ctx: Pick<InstallContext, "cwd" | "home">): string {
  return expand(CANONICAL[scope], ctx);
}
