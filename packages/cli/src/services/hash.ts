/**
 * Content hashing shared by the registry generator and the installer, so a
 * registry hash and an installed-directory hash are directly comparable.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { listFilesRecursive } from "./fs-utils.js";

const PREFIX = "sha256:";

/** Line endings are normalized so a CRLF checkout hashes like an LF download. */
function normalize(content: Buffer): Buffer {
  const text = content.toString("utf8");
  return Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
}

export interface HashedFile {
  /** Skill-relative path with POSIX separators. */
  rel: string;
  content: Buffer;
}

export function hashFiles(files: HashedFile[]): string {
  const sorted = [...files].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash("sha256");
  for (const f of sorted) {
    const fileHash = createHash("sha256").update(normalize(f.content)).digest("hex");
    h.update(`${f.rel}\0${fileHash}\n`);
  }
  return PREFIX + h.digest("hex");
}

export async function hashDirectory(dir: string): Promise<string> {
  const rels = await listFilesRecursive(dir);
  const files: HashedFile[] = [];
  for (const rel of rels) files.push({ rel, content: await readFile(path.join(dir, rel)) });
  return hashFiles(files);
}
