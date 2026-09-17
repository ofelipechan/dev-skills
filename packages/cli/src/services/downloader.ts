/**
 * GitHub-backed RegistrySource. Only raw file downloads: the registry lists
 * every file of every skill, so no GitHub API (and no rate limit) is needed.
 * Swapping to a CDN = another RegistrySource; the installer never changes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SourceError } from "./errors.js";
import { parseRegistry, CATALOG_SUBDIR, REGISTRY_FILE } from "./registry.js";
import type { Registry, RegistrySkill, RegistrySource } from "./types.js";

export interface GitHubSourceOptions {
  owner: string;
  repo: string;
  ref: string;
  /** Repo-relative directory that contains registry.json and skills/. */
  basePath: string;
  fetch?: typeof fetch;
}

export const DEFAULT_GITHUB_SOURCE: Omit<GitHubSourceOptions, "fetch"> = {
  owner: "ofelipechan",
  repo: "dev-skills",
  ref: "main",
  basePath: "packages/skills",
};

export class GitHubSource implements RegistrySource {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GitHubSourceOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
  }

  private url(rel: string): string {
    const { owner, repo, ref, basePath } = this.opts;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${basePath}/${rel}`;
  }

  private async download(rel: string): Promise<ArrayBuffer> {
    const url = this.url(rel);
    let res: Response;
    try {
      res = await this.fetchImpl(url);
    } catch (err) {
      throw new SourceError(`${url}: ${(err as Error).message}`);
    }
    if (!res.ok) throw new SourceError(`${url} responded ${res.status}`);
    return res.arrayBuffer();
  }

  async getRegistry(): Promise<Registry> {
    const buf = await this.download(REGISTRY_FILE);
    return parseRegistry(Buffer.from(buf).toString("utf8"));
  }

  async fetchSkill(skill: RegistrySkill, destDir: string): Promise<void> {
    for (const rel of skill.files) {
      const buf = await this.download(`${CATALOG_SUBDIR}/${skill.path}/${rel}`);
      const target = path.join(destDir, ...rel.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(buf));
    }
  }
}
