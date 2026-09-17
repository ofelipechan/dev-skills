/**
 * Registry schema, generator and the local (filesystem) source.
 * The CLI never hard-codes skills; everything comes from registry.json.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { InvalidRegistryError, SkillNotFoundError } from "./errors.js";
import { hashFiles } from "./hash.js";
import { copyDirectory, listFilesRecursive } from "./fs-utils.js";
import type { Registry, RegistrySkill, RegistrySource } from "./types.js";

/** Directory (inside the skills package) that holds the catalog tree. */
export const CATALOG_SUBDIR = "skills";
export const REGISTRY_FILE = "registry.json";
export const SKILL_FILE = "SKILL.md";

const SkillNameSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-case only");

export const RegistrySkillSchema = z.object({
  name: SkillNameSchema,
  description: z.string().min(1),
  category: z.string().min(1),
  path: z.string().min(1),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  files: z.array(z.string().min(1)).min(1),
});

export const RegistrySchema = z.object({
  version: z.literal(1),
  skills: z.array(RegistrySkillSchema),
});

const FrontmatterSchema = z.object({
  name: SkillNameSchema,
  description: z.string().min(1),
});

export function parseRegistry(raw: unknown): Registry {
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new InvalidRegistryError(`not valid JSON (${(err as Error).message})`);
    }
  }
  const result = RegistrySchema.safeParse(data);
  if (!result.success) throw new InvalidRegistryError(z.prettifyError(result.error));
  return result.data;
}

export function findSkill(registry: Registry, name: string): RegistrySkill {
  const skill = registry.skills.find((s) => s.name === name);
  if (!skill) throw new SkillNotFoundError(name);
  return skill;
}

async function findSkillDirs(dir: string, base: string, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  if (entries.some((e) => e.isFile() && e.name === SKILL_FILE)) {
    acc.push(path.relative(base, dir).split(path.sep).join("/"));
    return acc; // a skill directory is a leaf; nested SKILL.md files are its own content
  }
  for (const e of entries) if (e.isDirectory()) await findSkillDirs(path.join(dir, e.name), base, acc);
  return acc;
}

/**
 * Walk the catalog (`<catalogDir>/skills/**\/SKILL.md`) and build the registry.
 * Deterministic: sorted by path, hashed by content.
 */
export async function buildRegistry(catalogDir: string): Promise<Registry> {
  const root = path.join(catalogDir, CATALOG_SUBDIR);
  const skillPaths = (await findSkillDirs(root, root)).sort();
  const skills: RegistrySkill[] = [];
  const seen = new Map<string, string>();

  for (const skillPath of skillPaths) {
    const dir = path.join(root, skillPath);
    const fm = matter(await readFile(path.join(dir, SKILL_FILE), "utf8"));
    const parsed = FrontmatterSchema.safeParse(fm.data);
    if (!parsed.success) throw new InvalidRegistryError(`${skillPath}/${SKILL_FILE} frontmatter: ${z.prettifyError(parsed.error)}`);

    const { name, description } = parsed.data;
    const dup = seen.get(name);
    if (dup) throw new InvalidRegistryError(`duplicate skill name "${name}" in ${dup} and ${skillPath}`);
    seen.set(name, skillPath);

    const files = await listFilesRecursive(dir);
    const contents = await Promise.all(files.map(async (rel) => ({ rel, content: await readFile(path.join(dir, rel)) })));
    const category = skillPath.split("/")[0] ?? "";
    skills.push({ name, description, category, path: skillPath, hash: hashFiles(contents), files });
  }

  return parseRegistry({ version: 1, skills });
}

/** Reads a catalog from disk. Used by tests and by `DEV_SKILLS_SOURCE=<dir>` for local development. */
export class LocalSource implements RegistrySource {
  constructor(private readonly catalogDir: string) {}

  async getRegistry(): Promise<Registry> {
    let text: string;
    try {
      text = await readFile(path.join(this.catalogDir, REGISTRY_FILE), "utf8");
    } catch (err) {
      throw new InvalidRegistryError(`cannot read ${REGISTRY_FILE} in ${this.catalogDir} (${(err as Error).message})`);
    }
    return parseRegistry(text);
  }

  async fetchSkill(skill: RegistrySkill, destDir: string): Promise<void> {
    await copyDirectory(path.join(this.catalogDir, CATALOG_SUBDIR, skill.path), destDir);
  }
}
