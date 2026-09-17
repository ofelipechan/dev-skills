#!/usr/bin/env node
/**
 * Entry point. No arguments → interactive wizard. Subcommands → non-interactive.
 */
import { createRequire } from "node:module";
import { Command } from "commander";
import { registerInstall } from "./commands/install.js";
import { registerList } from "./commands/list.js";
import { registerRemove } from "./commands/remove.js";
import { registerUpdate } from "./commands/update.js";
import { runWizard } from "./ui/wizard.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command()
  .name("dev-skills")
  .description("Install reusable Agent Skills into Claude Code, OpenAI Codex and future agents.")
  .version(version)
  .action(async () => {
    await runWizard();
  });

registerInstall(program);
registerList(program);
registerUpdate(program);
registerRemove(program);

await program.parseAsync(process.argv);
