// Copy root README + LICENSE into packages/cli so the npm page and tarball carry them.
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = path.join(root, "packages", "cli");
for (const f of ["README.md", "LICENSE"]) await copyFile(path.join(root, f), path.join(pkg, f));
console.log("copied README.md, LICENSE -> packages/cli");
