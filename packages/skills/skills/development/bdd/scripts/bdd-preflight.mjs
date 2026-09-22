#!/usr/bin/env node
// Verify the client-neutral BDD harness and each target agent's config.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SCRIPT_PATH = fileURLToPath(import.meta.url).split(path.sep).join("/");
const args = process.argv.slice(2);

// --agent claude|codex → report only that agent, unwrapped; --agent both or no flag → every detected agent under `agents`.
const agentFlag = args.indexOf("--agent");
const requestedAgent = agentFlag === -1 ? undefined : args[agentFlag + 1];
if (requestedAgent !== undefined && !["claude", "codex", "both"].includes(requestedAgent)) {
  process.stderr.write(`bdd-preflight: unknown agent "${requestedAgent}" (expected claude, codex, or both)\n`);
  process.exit(2);
}

function requestedAgents() {
  if (requestedAgent === "both") return ["claude", "codex"];
  if (requestedAgent === "claude" || requestedAgent === "codex") return [requestedAgent];
  const agents = [];
  if (
    SCRIPT_PATH.includes("/.claude/") ||
    fs.existsSync(path.join(ROOT, ".claude", "skills", "bdd", "SKILL.md")) ||
    fs.existsSync(path.join(ROOT, ".claude", "bdd.config.json"))
  ) agents.push("claude");
  if (
    SCRIPT_PATH.includes("/.agents/") ||
    fs.existsSync(path.join(ROOT, ".agents", "skills", "bdd", "SKILL.md")) ||
    fs.existsSync(path.join(ROOT, ".agents", "bdd.config.json"))
  ) agents.push("codex");
  return agents.length ? [...new Set(agents)] : ["claude", "codex"];
}

const configPaths = {
  claude: path.join(ROOT, ".claude", "bdd.config.json"),
  codex: path.join(ROOT, ".agents", "bdd.config.json"),
};
const agents = requestedAgents();
const sharedMissing = [];

function configProblems(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["must be a JSON object"];
  const out = [];
  if (typeof value.specsDir !== "string" || value.specsDir.length === 0) out.push("specsDir must be a non-empty string");
  for (const key of ["testGlobs", "ignoreDirs", "pyramidTags", "modifierTags"]) {
    if (!Array.isArray(value[key]) || value[key].some((item) => typeof item !== "string")) out.push(`${key} must be an array of strings`);
  }
  if (typeof value.unimplementedTag !== "string" || value.unimplementedTag.length === 0) out.push("unimplementedTag must be a non-empty string");
  if (!Array.isArray(value.phrasingBanlist)) out.push("phrasingBanlist must be an array");
  return out;
}

for (const rel of ["specs", "docs/TESTING_PHILOSOPHY.md"]) {
  if (!fs.existsSync(path.join(ROOT, rel))) sharedMissing.push(rel);
}

// Each agent is reported on its own so the invoking agent can ignore the others.
const report = { agents: {} };
for (const agent of agents) {
  const configPath = configPaths[agent];
  const rel = path.relative(ROOT, configPath).split(path.sep).join("/");
  const missing = [...sharedMissing];
  const problems = [];
  if (!fs.existsSync(configPath)) {
    missing.push(rel);
  } else {
    try {
      const value = JSON.parse(fs.readFileSync(configPath, "utf8"));
      for (const problem of configProblems(value)) problems.push(`${rel}: ${problem}`);
    } catch (error) {
      problems.push(`${rel}: invalid JSON (${error.message})`);
    }
  }
  const status = problems.length ? "invalid" : missing.length ? "incomplete" : "complete";
  report.agents[agent] = { status, missing, problems };
}

const statuses = Object.values(report.agents).map((entry) => entry.status);
const output = requestedAgent && requestedAgent !== "both" ? { [requestedAgent]: report.agents[requestedAgent] } : report;
process.stdout.write(JSON.stringify(output, null, 2) + "\n");
process.exit(statuses.includes("invalid") ? 2 : statuses.includes("incomplete") ? 1 : 0);
