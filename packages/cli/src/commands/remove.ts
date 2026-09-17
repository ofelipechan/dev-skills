/** `dev-skills remove <skills...> [--global]` */
import type { Command } from "commander";
import { createContext } from "../services/context.js";
import { remove } from "../services/installer.js";
import { printError, printRemoveResult } from "./output.js";

export function registerRemove(program: Command): void {
  program
    .command("remove <skills...>")
    .alias("uninstall")
    .description("Remove installed skills from every agent listed in the lockfile")
    .option("-g, --global", "Operate on the global lockfile instead of the project")
    .action(async (skills: string[], flags: { global?: boolean }) => {
      try {
        const result = await remove({ skills, scope: flags.global ? "global" : "project" }, createContext());
        printRemoveResult(result);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
