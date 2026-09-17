/**
 * Shared contracts. Every layer (wizard, commands, services) talks in these
 * terms; agent-specific knowledge lives only in `agents.ts`.
 */

export type AgentId = "claude-code" | "codex";

export type Scope = "project" | "global";

export type Strategy = "copy" | "symlink";

export interface AgentConfig {
  id: AgentId;
  name: string;
  /** Relative to the project root. */
  projectSkillsDir: string;
  /** May start with `~/`, resolved against the user's home. */
  globalSkillsDir: string;
}

/** Normalized request served by the installer for both wizard and CLI flags. */
export interface InstallRequest {
  skills: string[];
  agents: AgentId[];
  scope: Scope;
  strategy: Strategy;
  /** Overwrite unmanaged destinations instead of failing. */
  force?: boolean;
}

export interface UpdateRequest {
  /** Empty = every skill in the lockfile. */
  skills?: string[];
  scope: Scope;
  /** Overwrite locally modified copies. */
  force?: boolean;
}

export interface RemoveRequest {
  skills: string[];
  scope: Scope;
}

export interface RegistrySkill {
  name: string;
  description: string;
  category: string;
  /** Catalog-relative directory, e.g. `testing/bdd`. */
  path: string;
  /** `sha256:<hex>` over every file in the skill directory. */
  hash: string;
  /** Skill-relative file paths, POSIX separators, sorted. */
  files: string[];
}

export interface Registry {
  version: 1;
  skills: RegistrySkill[];
}

/**
 * Where skills come from. GitHub today, a CDN tomorrow; the installer never
 * knows the difference.
 */
export interface RegistrySource {
  getRegistry(): Promise<Registry>;
  /** Materialize the whole skill directory (SKILL.md + references/scripts/assets) into `destDir`. */
  fetchSkill(skill: RegistrySkill, destDir: string): Promise<void>;
}

export interface LockEntry {
  hash: string;
  agents: AgentId[];
  scope: Scope;
  strategy: Strategy;
  installedAt: string;
}

export interface Lockfile {
  version: 1;
  skills: Record<string, LockEntry>;
}

/** Everything the services need from the environment; tests inject temp dirs. */
export interface InstallContext {
  cwd: string;
  home: string;
  source: RegistrySource;
  platform?: NodeJS.Platform;
  /** Override link creation (tests simulate OS refusal). `target` is what the link points at. */
  symlink?: (target: string, linkPath: string) => Promise<void>;
}

export interface InstalledTarget {
  skill: string;
  agent: AgentId;
  path: string;
  strategy: Strategy;
}

export interface InstallResult {
  installed: InstalledTarget[];
  /** Canonical directories created for symlink installs. */
  canonical: string[];
}

export interface UpdateResult {
  updated: string[];
  upToDate: string[];
  /** Skipped because local content differs from the lockfile hash. */
  modified: string[];
  /** In the lockfile but no longer in the registry. */
  missing: string[];
}

export interface RemoveResult {
  removed: InstalledTarget[];
  canonicalRemoved: string[];
}

export interface InstalledSkill {
  name: string;
  scope: Scope;
  entry: LockEntry;
  /** Registry hash differs from the installed hash. */
  updateAvailable: boolean;
}
