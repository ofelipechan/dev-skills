/** Typed failures the command layer turns into messages; services never print. */

export class DevSkillsError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedAgentError extends DevSkillsError {
  constructor(public readonly agent: string, supported: string[]) {
    super(`Unsupported agent "${agent}". Supported: ${supported.join(", ")}`, "UNSUPPORTED_AGENT");
  }
}

export class SkillNotFoundError extends DevSkillsError {
  constructor(public readonly skill: string) {
    super(`Skill "${skill}" is not in the registry`, "SKILL_NOT_FOUND");
  }
}

export class InvalidRegistryError extends DevSkillsError {
  constructor(detail: string) {
    super(`Invalid registry: ${detail}`, "INVALID_REGISTRY");
  }
}

export class InvalidLockfileError extends DevSkillsError {
  constructor(public readonly path: string, detail: string) {
    super(`Invalid lockfile at ${path}: ${detail}`, "INVALID_LOCKFILE");
  }
}

export class DestinationExistsError extends DevSkillsError {
  constructor(public readonly path: string) {
    super(`Destination already exists and is not managed by dev-skills: ${path} (use --force to overwrite)`, "DESTINATION_EXISTS");
  }
}

export class SymlinkError extends DevSkillsError {
  constructor(public readonly path: string, public readonly target: string, cause: unknown) {
    super(`Could not create symlink ${path} -> ${target}: ${cause instanceof Error ? cause.message : String(cause)}`, "SYMLINK_FAILED");
  }
}

export class NotManagedError extends DevSkillsError {
  constructor(public readonly skill: string, scope: string) {
    super(`Skill "${skill}" is not in the ${scope} lockfile; refusing to remove unmanaged files`, "NOT_MANAGED");
  }
}

export class SourceError extends DevSkillsError {
  constructor(detail: string) {
    super(`Could not reach the skills source: ${detail}`, "SOURCE_UNAVAILABLE");
  }
}
