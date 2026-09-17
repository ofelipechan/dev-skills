/** `dev-skills install <skills...>` — flags in, InstallRequest out, installer does the rest. */
import type { Command } from "commander";
import { AGENT_IDS, getAgent, isAgentId } from "../services/agents.js";
import { createContext } from "../services/context.js";
import { DevSkillsError, UnsupportedAgentError } from "../services/errors.js";
import { install } from "../services/installer.js";
import type { AgentId, InstallRequest, Strategy } from "../services/types.js";
import { printError, printInstallResult } from "./output.js";

export interface InstallFlags {
  agent?: string | string[];
  global?: boolean;
  strategy?: string;
  force?: boolean;
}

const STRATEGIES: Strategy[] = ["copy", "symlink"];

export function parseAgents(value: string | string[] | undefined): AgentId[] {
  if (value === undefined) return [...AGENT_IDS];
  const ids = Array.isArray(value) ? value : [value];
  return ids.map((id) => {
    if (!isAgentId(id)) throw new UnsupportedAgentError(id, AGENT_IDS);
    return getAgent(id).id;
  });
}

export function parseStrategy(value: string | undefined): Strategy {
  if (value === undefined) return "copy";
  if (!STRATEGIES.includes(value as Strategy)) throw new DevSkillsError(`Unknown strategy "${value}". Use: ${STRATEGIES.join(", ")}`, "INVALID_STRATEGY");
  return value as Strategy;
}

/** Deterministic defaults: every agent, project scope, copy. Never prompts. */
export function toInstallRequest(skills: string[], flags: InstallFlags): InstallRequest {
  return {
    skills,
    agents: parseAgents(flags.agent),
    scope: flags.global ? "global" : "project",
    strategy: parseStrategy(flags.strategy),
    force: flags.force ?? false,
  };
}

export function registerInstall(program: Command): void {
  program
    .command("install <skills...>")
    .description("Install one or more skills")
    .option("-a, --agent <id>", `Target agent (repeatable). Default: all (${AGENT_IDS.join(", ")})`, collect, undefined)
    .option("-g, --global", "Install into the user-level skills directories instead of the project")
    .option("-s, --strategy <copy|symlink>", "How files are laid out (default: copy)")
    .option("-f, --force", "Overwrite destinations that dev-skills does not manage")
    .action(async (skills: string[], flags: InstallFlags) => {
      try {
        const req = toInstallRequest(skills, flags);
        const result = await install(req, createContext());
        printInstallResult(req, result);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}

function collect(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}
