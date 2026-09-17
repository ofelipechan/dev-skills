/** `dev-skills update [skills...] [--global] [--force]` */
import type { Command } from "commander";
import { createContext } from "../services/context.js";
import { update } from "../services/installer.js";
import { printError, printUpdateResult } from "./output.js";

export function registerUpdate(program: Command): void {
  program
    .command("update [skills...]")
    .description("Update installed skills to the registry version (all when no names given)")
    .option("-g, --global", "Operate on the global lockfile instead of the project")
    .option("-f, --force", "Overwrite locally modified skills")
    .action(async (skills: string[], flags: { global?: boolean; force?: boolean }) => {
      try {
        const result = await update({ skills, scope: flags.global ? "global" : "project", force: flags.force ?? false }, createContext());
        printUpdateResult(result);
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
