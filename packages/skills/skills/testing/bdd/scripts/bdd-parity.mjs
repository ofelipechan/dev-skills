#!/usr/bin/env node
// Spec <-> test parity report. CLI, CI, and Stop hook.
//
//   node .claude/hooks/bdd-parity.mjs            report; exit 1 on gaps
//   node .claude/hooks/bdd-parity.mjs --json     machine-readable
//   node .claude/hooks/bdd-parity.mjs --hook     (Stop hook) reads stdin JSON; blocks the stop once with the gap list.
//
// Gaps:
//   unbound   tagged scenario (not @unimplemented) with no @scenario binding
//   orphan    @scenario binding whose title matches no scenario
//   stale     scenario tagged @unimplemented that IS bound (drop the tag)
import { execFileSync } from "node:child_process";
import { loadConfig, readStdinJson, collectScenarios, collectBindings } from "./bdd-lib.mjs";

// Files modified/added/renamed in the git working tree (staged or not), repo-relative.
// Returns null when git is unavailable so the caller falls back to a full check.
function changedFiles() {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = line.slice(3).trim();
      files.add(p.includes(" -> ") ? p.split(" -> ")[1] : p);
    }
    return files;
  } catch {
    return null;
  }
}

const cfg = loadConfig();
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const isStopHook = args.includes("--hook");
const stdin = isStopHook ? readStdinJson() : {};

const scenarios = collectScenarios(cfg);
const bindings = collectBindings(cfg);
const bound = new Set(bindings.map((b) => b.scenario));
const titles = new Set(scenarios.map((s) => s.title));

const unbound = scenarios.filter((s) => !s.tags.includes(cfg.unimplementedTag) && !bound.has(s.title));
const stale = scenarios.filter((s) => s.tags.includes(cfg.unimplementedTag) && bound.has(s.title));
const pending = scenarios.filter((s) => s.tags.includes(cfg.unimplementedTag) && !bound.has(s.title));
const orphan = bindings.filter((b) => !titles.has(b.scenario));

const report = {
  scenarios: scenarios.length,
  bindings: bindings.length,
  unbound: unbound.map((s) => ({ title: s.title, file: s.file, line: s.line, tags: s.tags })),
  orphan: orphan.map((b) => ({ scenario: b.scenario, file: b.file, line: b.line })),
  stale: stale.map((s) => ({ title: s.title, file: s.file, line: s.line })),
  pending: pending.map((s) => ({ title: s.title, file: s.file, line: s.line })),
};
const hasGaps = unbound.length + orphan.length + stale.length > 0;

function text() {
  const out = [];
  out.push(`[bdd:parity] ${report.scenarios} scenario(s), ${report.bindings} binding(s), ${pending.length} @${cfg.unimplementedTag}`);
  if (unbound.length) {
    out.push(`\nUNBOUND (${unbound.length}) - tagged scenarios without a test:`);
    for (const s of unbound) out.push(`  ${s.file}:${s.line}  [${s.tags.map((t) => "@" + t).join(" ")}] ${s.title}`);
  }
  if (orphan.length) {
    out.push(`\nORPHAN (${orphan.length}) - @scenario bindings that match no scenario:`);
    for (const b of orphan) out.push(`  ${b.file}:${b.line}  "${b.scenario}"`);
  }
  if (stale.length) {
    out.push(`\nSTALE (${stale.length}) - @${cfg.unimplementedTag} scenarios that are already bound (drop the tag):`);
    for (const s of stale) out.push(`  ${s.file}:${s.line}  ${s.title}`);
  }
  if (!hasGaps) out.push("parity ok");
  return out.join("\n") + "\n";
}

if (isStopHook) {
  // Never block twice in a row (stop_hook_active = we already blocked once this turn).
  if (!hasGaps || stdin.stop_hook_active) process.exit(0);
  // Only gaps in files touched in this working tree block the stop; pre-existing
  // backlog is reported by the CLI / CI run, not by every session end.
  const changed = changedFiles();
  if (changed) {
    const inScope = (f) => changed.has(f);
    const scoped =
      unbound.filter((s) => inScope(s.file)).length +
      orphan.filter((b) => inScope(b.file)).length +
      stale.filter((s) => inScope(s.file)).length;
    if (scoped === 0) process.exit(0);
  }
  const reason =
    "BDD parity gap in files you changed. Every tagged scenario needs a bound test (or the @" +
    cfg.unimplementedTag +
    " tag), and every binding needs a scenario. Fix or tag before finishing:\n" +
    text();
  process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
  process.exit(0);
}

if (asJson) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
else process.stdout.write(text());
process.exit(hasGaps ? 1 : 0);
