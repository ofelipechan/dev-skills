/** Builds the InstallContext for a real run. Tests build their own with temp dirs. */
import { homedir } from "node:os";
import path from "node:path";
import { GitHubSource, DEFAULT_GITHUB_SOURCE } from "./downloader.js";
import { SourceError } from "./errors.js";
import { LocalSource } from "./registry.js";
import type { InstallContext, RegistrySource } from "./types.js";

/**
 * `DEV_SKILLS_SOURCE=<dir>` points the CLI at a local catalog (the
 * `packages/skills` folder of a checkout) for development.
 * `DEV_SKILLS_REF=<branch|tag>` pins the GitHub ref.
 */
export function createSource(env: NodeJS.ProcessEnv = process.env): RegistrySource {
  const local = env["DEV_SKILLS_SOURCE"];
  if (local) {
    // Unquoted `C:\a\b` in bash arrives as `C:ab`, which Windows would resolve against a drive-specific cwd.
    if (!path.isAbsolute(local)) {
      throw new SourceError(`DEV_SKILLS_SOURCE must be an absolute path, got "${local}" (in bash, quote Windows paths or use forward slashes)`);
    }
    return new LocalSource(local);
  }
  const ref = env["DEV_SKILLS_REF"];
  return new GitHubSource({ ...DEFAULT_GITHUB_SOURCE, ...(ref ? { ref } : {}) });
}

export function createContext(env: NodeJS.ProcessEnv = process.env): InstallContext {
  return { cwd: process.cwd(), home: homedir(), source: createSource(env) };
}
