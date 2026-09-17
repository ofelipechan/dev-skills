/** Builds the InstallContext for a real run. Tests build their own with temp dirs. */
import { homedir } from "node:os";
import { GitHubSource, DEFAULT_GITHUB_SOURCE } from "./downloader.js";
import { LocalSource } from "./registry.js";
import type { InstallContext, RegistrySource } from "./types.js";

/**
 * `DEV_SKILLS_SOURCE=<dir>` points the CLI at a local catalog (the
 * `packages/skills` folder of a checkout) for development.
 * `DEV_SKILLS_REF=<branch|tag>` pins the GitHub ref.
 */
export function createSource(env: NodeJS.ProcessEnv = process.env): RegistrySource {
  const local = env["DEV_SKILLS_SOURCE"];
  if (local) return new LocalSource(local);
  const ref = env["DEV_SKILLS_REF"];
  return new GitHubSource({ ...DEFAULT_GITHUB_SOURCE, ...(ref ? { ref } : {}) });
}

export function createContext(env: NodeJS.ProcessEnv = process.env): InstallContext {
  return { cwd: process.cwd(), home: homedir(), source: createSource(env) };
}
