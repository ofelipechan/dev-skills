import { mkdtemp, mkdir, writeFile, rm, readFile, lstat, readlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildRegistry, LocalSource } from "../src/services/registry.js";
import type { InstallContext } from "../src/services/types.js";

/** One isolated sandbox per test: a fake catalog, a fake project and a fake home. */
export interface Sandbox {
  root: string;
  catalog: string;
  project: string;
  home: string;
  ctx: InstallContext;
  cleanup(): Promise<void>;
}

const CATALOG_SKILLS: Record<string, Record<string, string>> = {
  "testing/bdd": {
    "SKILL.md": "---\nname: bdd\ndescription: Behaviour-driven workflow.\n---\n\n# BDD\n",
    "references/philosophy.md": "# Philosophy\n",
    "scripts/check.mjs": "console.log('check');\n",
  },
  "development/code-review": {
    "SKILL.md": "---\nname: code-review\ndescription: Review diffs.\n---\n\n# Code review\n",
  },
  "architecture/system-design": {
    "SKILL.md": "---\nname: system-design\ndescription: Design systems.\n---\n\n# System design\n",
    "assets/diagram.txt": "box -> box\n",
  },
};

export async function writeSkill(catalog: string, skillPath: string, files: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(catalog, "skills", skillPath, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf8");
  }
}

export async function makeSandbox(): Promise<Sandbox> {
  const root = await mkdtemp(path.join(tmpdir(), "dev-skills-"));
  const catalog = path.join(root, "catalog");
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(project, { recursive: true });
  await mkdir(home, { recursive: true });
  for (const [skillPath, files] of Object.entries(CATALOG_SKILLS)) await writeSkill(catalog, skillPath, files);
  await regenerateRegistry(catalog);
  const source = new LocalSource(catalog);
  return {
    root,
    catalog,
    project,
    home,
    ctx: { cwd: project, home, source },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function regenerateRegistry(catalog: string): Promise<void> {
  const registry = await buildRegistry(catalog);
  await writeFile(path.join(catalog, "registry.json"), JSON.stringify(registry, null, 2), "utf8");
}

export async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

export async function isSymlink(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isRealDir(p: string): Promise<boolean> {
  try {
    const st = await lstat(p);
    return st.isDirectory() && !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Absolute, normalized path the link ultimately points at. */
export async function linkTarget(p: string): Promise<string> {
  return realpath(p);
}

export async function readText(p: string): Promise<string> {
  return readFile(p, "utf8");
}

export async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

export { readlink };
