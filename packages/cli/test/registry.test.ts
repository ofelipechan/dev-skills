import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildRegistry, parseRegistry, findSkill, LocalSource } from "../src/services/registry.js";
import { InvalidRegistryError, SkillNotFoundError } from "../src/services/errors.js";
import { makeSandbox, writeSkill, exists, readText, type Sandbox } from "./helpers.js";

describe("buildRegistry()", () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await makeSandbox();
  });
  afterEach(() => sb.cleanup());

  /** Every SKILL.md under the catalog becomes one registry entry. */
  it("discovers every skill recursively", async () => {
    const registry = await buildRegistry(sb.catalog);
    expect(registry.version).toBe(1);
    expect(registry.skills.map((s) => s.name).sort()).toEqual(["bdd", "code-review", "system-design"]);
  });

  /** The catalog path and top-level folder give category and path. */
  it("derives category and path from the directory layout", async () => {
    const registry = await buildRegistry(sb.catalog);
    const bdd = registry.skills.find((s) => s.name === "bdd");
    expect(bdd).toMatchObject({ category: "testing", path: "testing/bdd", description: "Behaviour-driven workflow." });
  });

  /** The whole directory is the distribution unit, so every file is listed. */
  it("lists every file of the skill directory with posix separators", async () => {
    const registry = await buildRegistry(sb.catalog);
    const bdd = registry.skills.find((s) => s.name === "bdd")!;
    expect(bdd.files).toEqual(["SKILL.md", "references/philosophy.md", "scripts/check.mjs"]);
  });

  /** Content changes must be detectable from the registry alone. */
  it("changes the hash when a skill file changes", async () => {
    const before = (await buildRegistry(sb.catalog)).skills.find((s) => s.name === "bdd")!.hash;
    await writeSkill(sb.catalog, "testing/bdd", { "references/philosophy.md": "# Philosophy v2\n" });
    const after = (await buildRegistry(sb.catalog)).skills.find((s) => s.name === "bdd")!.hash;
    expect(before).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(after).not.toBe(before);
  });

  /** Registry output is stable so the generated file only changes when content does. */
  it("orders skills deterministically by path", async () => {
    const a = await buildRegistry(sb.catalog);
    const b = await buildRegistry(sb.catalog);
    expect(a).toEqual(b);
    expect(a.skills.map((s) => s.path)).toEqual(["architecture/system-design", "development/code-review", "testing/bdd"]);
  });

  /** A SKILL.md without the required frontmatter is a catalog error, not a silent skip. */
  it("rejects a skill whose frontmatter lacks name or description", async () => {
    await writeSkill(sb.catalog, "testing/broken", { "SKILL.md": "---\nname: broken\n---\n\nno description\n" });
    await expect(buildRegistry(sb.catalog)).rejects.toBeInstanceOf(InvalidRegistryError);
  });

  /** Skill names must match their folder so discovery and installation agree. */
  it("rejects a skill whose name differs from its folder", async () => {
    await writeSkill(sb.catalog, "testing/mismatch", { "SKILL.md": "---\nname: other\ndescription: mismatch\n---\n" });
    await expect(buildRegistry(sb.catalog)).rejects.toBeInstanceOf(InvalidRegistryError);
  });

  /** Descriptions share the Agent Skills discovery limit. */
  it("rejects a description longer than 1024 characters", async () => {
    await writeSkill(sb.catalog, "testing/verbose", {
      "SKILL.md": `---\nname: verbose\ndescription: ${"x".repeat(1025)}\n---\n`,
    });
    await expect(buildRegistry(sb.catalog)).rejects.toBeInstanceOf(InvalidRegistryError);
  });

  /** Two skills with one name cannot be addressed unambiguously. */
  it("rejects duplicate skill names", async () => {
    await writeSkill(sb.catalog, "other/bdd", { "SKILL.md": "---\nname: bdd\ndescription: dup\n---\n" });
    await expect(buildRegistry(sb.catalog)).rejects.toBeInstanceOf(InvalidRegistryError);
  });
});

describe("parseRegistry()", () => {
  /** Only a registry that matches the schema is trusted. */
  it("rejects a registry with a missing skills array", () => {
    expect(() => parseRegistry({ version: 1 })).toThrow(InvalidRegistryError);
  });

  /** Unknown versions are refused rather than misread. */
  it("rejects an unsupported registry version", () => {
    expect(() => parseRegistry({ version: 2, skills: [] })).toThrow(InvalidRegistryError);
  });

  /** An entry without a hash cannot support update detection. */
  it("rejects a skill entry without a hash", () => {
    const raw = { version: 1, skills: [{ name: "x", description: "y", category: "c", path: "c/x", files: ["SKILL.md"] }] };
    expect(() => parseRegistry(raw)).toThrow(InvalidRegistryError);
  });

  /** Malformed JSON text is reported as an invalid registry. */
  it("rejects invalid JSON text", () => {
    expect(() => parseRegistry("{not json")).toThrow(InvalidRegistryError);
  });
});

describe("findSkill()", () => {
  /** Requesting a skill that is not published is an explicit error. */
  it("is rejected when the skill name is unknown", () => {
    const registry = { version: 1 as const, skills: [] };
    expect(() => findSkill(registry, "nope")).toThrow(SkillNotFoundError);
  });
});

describe("LocalSource", () => {
  let sb: Sandbox;
  beforeEach(async () => {
    sb = await makeSandbox();
  });
  afterEach(() => sb.cleanup());

  /** The local source reads the generated registry.json. */
  it("returns the registry from the catalog directory", async () => {
    const registry = await sb.ctx.source.getRegistry();
    expect(registry.skills.some((s) => s.name === "bdd")).toBe(true);
  });

  /** Fetching materializes the whole skill directory, not only SKILL.md. */
  it("copies every listed file into the destination", async () => {
    const registry = await sb.ctx.source.getRegistry();
    const bdd = registry.skills.find((s) => s.name === "bdd")!;
    const dest = path.join(sb.root, "staging", "bdd");
    await sb.ctx.source.fetchSkill(bdd, dest);
    expect(await exists(path.join(dest, "SKILL.md"))).toBe(true);
    expect(await readText(path.join(dest, "references/philosophy.md"))).toBe("# Philosophy\n");
    expect(await exists(path.join(dest, "scripts/check.mjs"))).toBe(true);
  });

  /** A catalog without a registry.json is unusable. */
  it("is rejected when registry.json is missing", async () => {
    const empty = path.join(sb.root, "empty-catalog");
    await mkdir(empty, { recursive: true });
    await expect(new LocalSource(empty).getRegistry()).rejects.toBeInstanceOf(InvalidRegistryError);
  });

  /** A registry.json that fails validation is refused. */
  it("is rejected when registry.json is invalid", async () => {
    await writeFile(path.join(sb.catalog, "registry.json"), JSON.stringify({ version: 1, skills: [{ name: "x" }] }), "utf8");
    await expect(new LocalSource(sb.catalog).getRegistry()).rejects.toBeInstanceOf(InvalidRegistryError);
  });
});
