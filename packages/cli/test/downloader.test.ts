import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GitHubSource } from "../src/services/downloader.js";
import { InvalidRegistryError, SourceError } from "../src/services/errors.js";
import { readText } from "./helpers.js";

const registry = {
  version: 1,
  skills: [
    { name: "bdd", description: "d", category: "testing", path: "testing/bdd", hash: "sha256:" + "a".repeat(64), files: ["SKILL.md", "references/r.md"] },
  ],
};

function fakeFetch(files: Record<string, string | number>): typeof fetch {
  const calls: string[] = [];
  const f = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(files).find(([suffix]) => url.endsWith(suffix));
    if (!hit) return new Response("not found", { status: 404 });
    const [, body] = hit;
    if (typeof body === "number") return new Response("error", { status: body });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  (f as unknown as { calls: string[] }).calls = calls;
  return f;
}

const source = (fetchImpl: typeof fetch) =>
  new GitHubSource({ owner: "ofelipechan", repo: "dev-skills", ref: "main", basePath: "packages/skills", fetch: fetchImpl });

describe("GitHubSource", () => {
  /** The registry is read from the raw GitHub URL of the catalog. */
  it("fetches and validates registry.json from raw.githubusercontent.com", async () => {
    const f = fakeFetch({ "/packages/skills/registry.json": JSON.stringify(registry) });
    const result = await source(f).getRegistry();
    expect(result.skills[0]?.name).toBe("bdd");
    const calls = (f as unknown as { calls: string[] }).calls;
    expect(calls[0]).toBe("https://raw.githubusercontent.com/ofelipechan/dev-skills/main/packages/skills/registry.json");
  });

  /** Every file listed in the registry entry is downloaded into the destination. */
  it("downloads every listed skill file", async () => {
    const f = fakeFetch({
      "/packages/skills/skills/testing/bdd/SKILL.md": "# BDD\n",
      "/packages/skills/skills/testing/bdd/references/r.md": "ref\n",
    });
    const dest = await mkdtemp(path.join(tmpdir(), "dev-skills-dl-"));
    try {
      await source(f).fetchSkill(registry.skills[0]!, path.join(dest, "bdd"));
      expect(await readText(path.join(dest, "bdd", "SKILL.md"))).toBe("# BDD\n");
      expect(await readText(path.join(dest, "bdd", "references", "r.md"))).toBe("ref\n");
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });

  /** A registry that does not validate is refused even if the download succeeded. */
  it("is rejected when the remote registry is invalid", async () => {
    const f = fakeFetch({ "/packages/skills/registry.json": JSON.stringify({ version: 1 }) });
    await expect(source(f).getRegistry()).rejects.toBeInstanceOf(InvalidRegistryError);
  });

  /** Network or HTTP failures surface as a source error, not a crash. */
  it("is rejected with a SourceError on HTTP failure", async () => {
    const f = fakeFetch({ "/packages/skills/registry.json": 500 });
    await expect(source(f).getRegistry()).rejects.toBeInstanceOf(SourceError);
  });

  /** A missing skill file aborts the fetch instead of producing a partial skill. */
  it("is rejected when a listed file is missing remotely", async () => {
    const f = fakeFetch({ "/packages/skills/skills/testing/bdd/SKILL.md": "# BDD\n" });
    const dest = await mkdtemp(path.join(tmpdir(), "dev-skills-dl-"));
    try {
      await expect(source(f).fetchSkill(registry.skills[0]!, path.join(dest, "bdd"))).rejects.toBeInstanceOf(SourceError);
    } finally {
      await rm(dest, { recursive: true, force: true });
    }
  });
});
