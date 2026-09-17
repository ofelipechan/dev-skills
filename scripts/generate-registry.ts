/**
 * Discover every packages/skills/skills/** /SKILL.md and write packages/skills/registry.json.
 *
 *   npm run generate:registry          write the file
 *   npm run check:registry             exit 1 when the committed file is stale (CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry, REGISTRY_FILE } from "../packages/cli/src/services/registry.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const catalogDir = path.resolve(here, "..", "packages", "skills");
const outFile = path.join(catalogDir, REGISTRY_FILE);
const check = process.argv.includes("--check");

const registry = await buildRegistry(catalogDir);
const next = JSON.stringify(registry, null, 2) + "\n";

if (check) {
  const current = await readFile(outFile, "utf8").catch(() => "");
  if (current.replace(/\r\n/g, "\n") !== next) {
    console.error(`${path.relative(process.cwd(), outFile)} is stale. Run: npm run generate:registry`);
    process.exit(1);
  }
  console.log(`${path.relative(process.cwd(), outFile)} is up to date (${registry.skills.length} skills)`);
} else {
  await writeFile(outFile, next, "utf8");
  console.log(`wrote ${path.relative(process.cwd(), outFile)} (${registry.skills.length} skills)`);
  for (const s of registry.skills) console.log(`  ${s.name.padEnd(20)} ${s.path.padEnd(32)} ${s.files.length} file(s)`);
}
