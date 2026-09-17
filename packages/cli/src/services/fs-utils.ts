/** Small filesystem helpers on top of node:fs/promises. No business rules here. */
import { cp, lstat, mkdir, readdir, rm, rmdir, unlink, symlink as fsSymlink } from "node:fs/promises";
import path from "node:path";

/** All files under `dir`, skill-relative, POSIX separators, sorted. */
export async function listFilesRecursive(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(full, base)));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

export type PathKind = "missing" | "symlink" | "directory" | "file";

/** What sits at `p` without following links. */
export async function pathKind(p: string): Promise<PathKind> {
  try {
    const st = await lstat(p);
    if (st.isSymbolicLink()) return "symlink";
    if (st.isDirectory()) return "directory";
    return "file";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw err;
  }
}

/** Remove a link (never its target) or a directory tree. Missing paths are fine. */
export async function removePath(p: string): Promise<void> {
  const kind = await pathKind(p);
  if (kind === "missing") return;
  if (kind === "symlink") {
    // Removes the link itself, never the target. Windows directory links and
    // junctions are directories to the API, so fall back to rmdir.
    try {
      await unlink(p);
    } catch {
      await rmdir(p);
    }
    return;
  }
  await rm(p, { recursive: kind === "directory", force: true });
}

export async function copyDirectory(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, dereference: true });
}

/**
 * Create a directory link. Windows uses junctions (no elevated privileges
 * needed, absolute target required); elsewhere a relative symlink for
 * project scope keeps the repository relocatable.
 */
export async function linkDirectory(target: string, linkPath: string, platform: NodeJS.Platform = process.platform): Promise<void> {
  await mkdir(path.dirname(linkPath), { recursive: true });
  if (platform === "win32") {
    await fsSymlink(path.resolve(target), linkPath, "junction");
    return;
  }
  const relative = path.relative(path.dirname(linkPath), target);
  await fsSymlink(relative, linkPath, "dir");
}
