import { describe, it, expect } from "vitest";
import { expandAll, toInstallRequest } from "../src/commands/install.js";
import { UnsupportedAgentError } from "../src/services/errors.js";

describe("expandAll()", () => {
  /** The "all" keyword stands for every skill the caller offers. */
  it("expands the all keyword to every available skill", () => {
    expect(expandAll(["all"], ["bdd", "code-review"])).toEqual(["bdd", "code-review"]);
  });

  /** "all" wins even when mixed with explicit names — nothing is listed twice. */
  it("ignores explicit names next to the all keyword", () => {
    expect(expandAll(["bdd", "all"], ["bdd", "code-review"])).toEqual(["bdd", "code-review"]);
  });

  /** Explicit selections pass through untouched. */
  it("leaves an explicit selection unchanged", () => {
    expect(expandAll(["bdd"], ["bdd", "code-review"])).toEqual(["bdd"]);
  });
});

describe("toInstallRequest()", () => {
  /** Flags map one-to-one onto the installer request; nothing is prompted. */
  it("builds a request from explicit flags", () => {
    const req = toInstallRequest(["bdd", "code-review"], { agent: ["claude-code", "codex"], global: true, strategy: "symlink", force: true });
    expect(req).toEqual({ skills: ["bdd", "code-review"], agents: ["claude-code", "codex"], scope: "global", strategy: "symlink", force: true });
  });

  /** Missing options fall back to deterministic defaults: every agent, project scope, copy. */
  it("defaults to all agents, project scope and copy strategy", () => {
    const req = toInstallRequest(["bdd"], {});
    expect(req).toEqual({ skills: ["bdd"], agents: ["claude-code", "codex"], scope: "project", strategy: "copy", force: false });
  });

  /** A single --agent flag is accepted as well as repeated ones. */
  it("accepts a single agent value", () => {
    expect(toInstallRequest(["bdd"], { agent: "codex" }).agents).toEqual(["codex"]);
  });

  /** Typos in agent ids fail fast with the supported list. */
  it("is rejected for an unsupported agent", () => {
    expect(() => toInstallRequest(["bdd"], { agent: ["cursor"] })).toThrow(UnsupportedAgentError);
  });

  /** Only copy and symlink are valid strategies. */
  it("is rejected for an unknown strategy", () => {
    expect(() => toInstallRequest(["bdd"], { strategy: "hardlink" })).toThrow();
  });
});
