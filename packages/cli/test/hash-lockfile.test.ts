import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { hashDirectory } from "../src/services/hash.js";
import { lockfilePath, readLockfile, writeLockfile } from "../src/services/lockfile.js";
import { InvalidLockfileError } from "../src/services/errors.js";
import type { InstallContext, Lockfile } from "../src/services/types.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dev-skills-hash-"));
});
afterEach(() => rm(root, { recursive: true, force: true }));

async function put(rel: string, content: string): Promise<void> {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

describe("hashDirectory()", () => {
  /** The same content always yields the same hash so lockfile comparison is meaningful. */
  it("is deterministic for identical content", async () => {
    await put("a/SKILL.md", "x\n");
    await put("a/ref/r.md", "y\n");
    await put("b/SKILL.md", "x\n");
    await put("b/ref/r.md", "y\n");
    expect(await hashDirectory(path.join(root, "a"))).toBe(await hashDirectory(path.join(root, "b")));
  });

  /** Renaming a file is a content change. */
  it("changes when a file path changes", async () => {
    await put("a/SKILL.md", "x\n");
    await put("b/SKILL2.md", "x\n");
    expect(await hashDirectory(path.join(root, "a"))).not.toBe(await hashDirectory(path.join(root, "b")));
  });

  /** A Windows checkout with CRLF must not look modified next to an LF download. */
  it("ignores line-ending differences", async () => {
    await put("a/SKILL.md", "line1\nline2\n");
    await put("b/SKILL.md", "line1\r\nline2\r\n");
    expect(await hashDirectory(path.join(root, "a"))).toBe(await hashDirectory(path.join(root, "b")));
  });

  /** Output format matches the registry so the two can be compared directly. */
  it("uses the sha256 prefix format", async () => {
    await put("a/SKILL.md", "x\n");
    expect(await hashDirectory(path.join(root, "a"))).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("lockfile", () => {
  const ctx = () => ({ cwd: path.join(root, "proj"), home: path.join(root, "home") }) as InstallContext;

  /** Project installs are tracked in .agents/skills-lock.json, global ones under the home directory. */
  it("resolves the lockfile path per scope", () => {
    expect(lockfilePath("project", ctx())).toBe(path.join(root, "proj", ".agents", "skills-lock.json"));
    expect(lockfilePath("global", ctx())).toBe(path.join(root, "home", ".agents", "skills-lock.json"));
  });

  /** A missing lockfile means nothing is installed. */
  it("reads an empty lockfile when none exists", async () => {
    expect(await readLockfile("project", ctx())).toEqual({ version: 1, skills: {} });
  });

  /** What is written is what is read back. */
  it("round-trips entries", async () => {
    const lock: Lockfile = {
      version: 1,
      skills: { bdd: { hash: "sha256:" + "a".repeat(64), agents: ["codex"], scope: "project", strategy: "copy", installedAt: "2026-01-01T00:00:00.000Z" } },
    };
    await writeLockfile("project", ctx(), lock);
    expect(await readLockfile("project", ctx())).toEqual(lock);
  });

  /** A corrupt lockfile is an error, not an empty state that would let us overwrite installs. */
  it("rejects a lockfile that fails validation", async () => {
    await put("proj/.agents/skills-lock.json", JSON.stringify({ version: 1, skills: { bdd: { hash: 1 } } }));
    await expect(readLockfile("project", ctx())).rejects.toBeInstanceOf(InvalidLockfileError);
  });
});
