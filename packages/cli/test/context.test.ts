import path from "node:path";
import { describe, it, expect } from "vitest";
import { createSource } from "../src/services/context.js";
import { GitHubSource } from "../src/services/downloader.js";
import { SourceError } from "../src/services/errors.js";
import { LocalSource } from "../src/services/registry.js";

describe("createSource()", () => {
  /** Without DEV_SKILLS_SOURCE the catalog comes from GitHub. */
  it("defaults to the GitHub source", () => {
    expect(createSource({})).toBeInstanceOf(GitHubSource);
  });

  /** An absolute DEV_SKILLS_SOURCE points at a local catalog. */
  it("uses a local catalog for an absolute path", () => {
    expect(createSource({ DEV_SKILLS_SOURCE: path.resolve("catalog") })).toBeInstanceOf(LocalSource);
  });

  /** A relative path would resolve against an arbitrary cwd, so it is refused up front. */
  it("is rejected for a relative path", () => {
    expect(() => createSource({ DEV_SKILLS_SOURCE: "packages/skills" })).toThrow(SourceError);
  });

  /** Bash strips unquoted backslashes, turning C:\a\b into the drive-relative C:ab. */
  it.runIf(process.platform === "win32")("is rejected for a drive-relative Windows path", () => {
    expect(() => createSource({ DEV_SKILLS_SOURCE: "C:UserscontaDocuments" })).toThrow(SourceError);
  });
});
