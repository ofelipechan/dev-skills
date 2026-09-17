/**
 * Interactive flow (`npx @ofelipechan/dev-skills` with no arguments). Collects answers,
 * builds the same requests the flag-based commands build, and hands them to
 * the installer. No filesystem access in this file.
 */
import * as p from "@clack/prompts";
import { listAgents } from "../services/agents.js";
import { createContext } from "../services/context.js";
import { SymlinkError } from "../services/errors.js";
import { install, listInstalled, remove, update } from "../services/installer.js";
import type { AgentId, InstallContext, InstallRequest, Registry, Scope, Strategy } from "../services/types.js";
import { printError } from "../commands/output.js";

type Action = "install" | "update" | "remove" | "list";

const STRATEGY_HELP = [
  "Symlink — one canonical copy in .agents/skills, each agent linked to it.",
  "          Edits are immediately visible to every linked agent.",
  "Copy    — each agent receives its own independent copy.",
  "          Edits to one copy do not affect the others.",
].join("\n");

/** Unwrap a prompt result; a cancelled prompt ends the wizard cleanly. */
function bail<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

async function askAction(): Promise<Action> {
  const action = bail(await p.select<Action>({
    message: "What would you like to do?",
    options: [
      { value: "install", label: "Install skills" },
      { value: "update", label: "Update skills" },
      { value: "remove", label: "Remove skills" },
      { value: "list", label: "List installed skills" },
    ],
  }));
  return action;
}

async function askScope(message = "Where should these skills be installed?"): Promise<Scope> {
  const scope = bail(await p.select<Scope>({
    message,
    options: [
      { value: "project", label: "Project", hint: "relative to the current directory" },
      { value: "global", label: "Global", hint: "user-level agent directories" },
    ],
  }));
  return scope;
}

async function askSkills(registry: Registry, message = "Select skills"): Promise<string[]> {
  const skills = bail(await p.multiselect<string>({
    message,
    options: registry.skills.map((s) => ({ value: s.name, label: s.name, hint: s.description })),
    required: true,
  }));
  return skills;
}

async function askAgents(): Promise<AgentId[]> {
  const agents = bail(await p.multiselect<AgentId>({
    message: "Select agents",
    options: listAgents().map((a) => ({ value: a.id, label: a.name })),
    initialValues: listAgents().map((a) => a.id),
    required: true,
  }));
  return agents;
}

async function askStrategy(agentCount: number): Promise<Strategy> {
  if (agentCount < 2) return "copy";
  p.note(STRATEGY_HELP, "Installation strategy");
  const strategy = bail(await p.select<Strategy>({
    message: "How should skills be shared between agents?",
    options: [
      { value: "symlink", label: "Symlink", hint: "keep one canonical copy and link each agent to it" },
      { value: "copy", label: "Copy", hint: "create an independent copy for each agent" },
    ],
  }));
  return strategy;
}

async function runInstall(ctx: InstallContext, registry: Registry): Promise<void> {
  const skills = await askSkills(registry);
  const agents = await askAgents();
  const scope = await askScope();
  const strategy = await askStrategy(agents.length);
  const req: InstallRequest = { skills, agents, scope, strategy };

  const s = p.spinner();
  s.start("Installing");
  try {
    const result = await install(req, ctx);
    s.stop(`Installed ${skills.length} skill(s) into ${agents.length} agent(s) [${scope}, ${strategy}]`);
    p.log.info(result.installed.map((t) => `${t.skill} → ${t.path}`).join("\n"));
  } catch (err) {
    s.stop("Installation failed");
    if (err instanceof SymlinkError) {
      p.log.warn(err.message);
      const fallback = bail(await p.confirm({ message: "Symlinks are not available here. Install independent copies instead?" }));
      if (fallback) return runInstallWith({ ...req, strategy: "copy" }, ctx);
    }
    throw err;
  }
}

async function runInstallWith(req: InstallRequest, ctx: InstallContext): Promise<void> {
  const s = p.spinner();
  s.start("Installing (copy)");
  const result = await install(req, ctx);
  s.stop(`Installed ${req.skills.length} skill(s) [${req.scope}, copy]`);
  p.log.info(result.installed.map((t) => `${t.skill} → ${t.path}`).join("\n"));
}

async function runUpdate(ctx: InstallContext): Promise<void> {
  const installed = await listInstalled(ctx);
  if (!installed.length) {
    p.log.warn("Nothing installed yet.");
    return;
  }
  const scope = await askScope("Which installation should be updated?");
  const inScope = installed.filter((i) => i.scope === scope);
  if (!inScope.length) {
    p.log.warn(`No ${scope} skills installed.`);
    return;
  }
  const skills = bail(await p.multiselect<string>({
    message: "Select skills to update",
    options: inScope.map((i) => ({ value: i.name, label: i.name, hint: i.updateAvailable ? "update available" : "up to date" })),
    initialValues: inScope.filter((i) => i.updateAvailable).map((i) => i.name),
    required: true,
  }));

  const s = p.spinner();
  s.start("Updating");
  let result = await update({ skills, scope }, ctx);
  s.stop("Update finished");
  if (result.modified.length) {
    p.log.warn(`Locally modified (not touched): ${result.modified.join(", ")}`);
    const force = bail(await p.confirm({ message: "Overwrite the modified skills with the registry version?", initialValue: false }));
    if (force) result = await update({ skills: result.modified, scope, force: true }, ctx);
  }
  if (result.updated.length) p.log.success(`Updated: ${result.updated.join(", ")}`);
  if (result.upToDate.length) p.log.info(`Up to date: ${result.upToDate.join(", ")}`);
  if (result.missing.length) p.log.warn(`Not in registry anymore: ${result.missing.join(", ")}`);
}

async function runRemove(ctx: InstallContext): Promise<void> {
  const installed = await listInstalled(ctx);
  if (!installed.length) {
    p.log.warn("Nothing installed yet.");
    return;
  }
  const scope = await askScope("Which installation should be modified?");
  const inScope = installed.filter((i) => i.scope === scope);
  if (!inScope.length) {
    p.log.warn(`No ${scope} skills installed.`);
    return;
  }
  const skills = bail(await p.multiselect<string>({
    message: "Select skills to remove",
    options: inScope.map((i) => ({ value: i.name, label: i.name, hint: `${i.entry.strategy}, ${i.entry.agents.join(" + ")}` })),
    required: true,
  }));
  const sure = bail(await p.confirm({ message: `Remove ${skills.join(", ")} from ${scope}?`, initialValue: false }));
  if (!sure) return;

  const result = await remove({ skills, scope }, ctx);
  p.log.success(result.removed.map((t) => `removed ${t.skill} (${t.agent}) ${t.path}`).join("\n"));
}

async function runList(ctx: InstallContext): Promise<void> {
  const installed = await listInstalled(ctx);
  if (!installed.length) {
    p.log.info("No skills installed.");
    return;
  }
  p.log.message(
    installed
      .map((i) => `${i.name.padEnd(20)} ${i.scope.padEnd(8)} ${i.entry.strategy.padEnd(8)} ${i.entry.agents.join(", ")}${i.updateAvailable ? "  (update available)" : ""}`)
      .join("\n"),
  );
}

export async function runWizard(): Promise<void> {
  p.intro("dev-skills");
  const ctx = createContext();
  try {
    const action = await askAction();
    if (action === "install") {
      const s = p.spinner();
      s.start("Fetching registry");
      const registry = await ctx.source.getRegistry();
      s.stop(`${registry.skills.length} skill(s) available`);
      await runInstall(ctx, registry);
    } else if (action === "update") await runUpdate(ctx);
    else if (action === "remove") await runRemove(ctx);
    else await runList(ctx);
    p.outro("Done.");
  } catch (err) {
    printError(err);
    process.exitCode = 1;
  }
}
