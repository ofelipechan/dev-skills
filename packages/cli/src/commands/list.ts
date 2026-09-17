/** `dev-skills list [--installed]` */
import type { Command } from "commander";
import { createContext } from "../services/context.js";
import { listInstalled } from "../services/installer.js";
import { printAvailable, printError, printInstalled } from "./output.js";

export function registerList(program: Command): void {
  program
    .command("list")
    .description("List available skills (or installed ones with --installed)")
    .option("-i, --installed", "Show only skills tracked by the project and global lockfiles")
    .action(async (flags: { installed?: boolean }) => {
      try {
        const ctx = createContext();
        if (flags.installed) {
          printInstalled(await listInstalled(ctx));
          return;
        }
        const registry = await ctx.source.getRegistry();
        printAvailable(registry, await listInstalled(ctx, registry));
      } catch (err) {
        printError(err);
        process.exitCode = 1;
      }
    });
}
