#!/usr/bin/env node
// Verify a BDD change in one call. Runs concurrently:
//   - check-feature on changed .feature files, check-test on changed test files
//   - parity
//   - config `commands` for every pyramid level touched by the change, with {files} = changed test files of that level
//   - config `commands.lint` and `commands.typecheck` when defined
// Prints one line per check and the output tail of each failure. Exit 1 when any check fails.
//
//   node <dir>/bdd-verify.mjs           scope = files changed in the git working tree
//   node <dir>/bdd-verify.mjs --all     every configured level, whole suite ({files} left empty)
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, isFeatureFile, isTestFile, parseFeature, parseTestFile, collectScenarios } from "./bdd-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const all = process.argv.includes("--all");
const cfg = loadConfig();
const commands = cfg.commands ?? {};
const TAIL = 30;

function changedFiles() {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
    return out
      .split(/\r?\n/)
      .filter((l) => l.trim() && l[0] !== "D" && l[1] !== "D")
      .map((l) => l.slice(3).trim())
      .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1] : p))
      .map((p) => p.replace(/^"|"$/g, ""));
  } catch {
    return null;
  }
}

const changed = changedFiles() ?? [];
const features = changed.filter((f) => isFeatureFile(f, cfg));
const tests = changed.filter((f) => isTestFile(f, cfg));

// Level of a test file = pyramid tags of the scenarios it binds.
const tagsByTitle = new Map(collectScenarios(cfg).map((s) => [s.title, s.tags]));
const levelOf = (tags) => tags.filter((t) => cfg.pyramidTags.includes(t));
const testsByLevel = new Map();
for (const file of tests) {
  for (const b of parseTestFile(file).bindings) {
    for (const level of levelOf(tagsByTitle.get(b.scenario) ?? [])) {
      testsByLevel.set(level, new Set([...(testsByLevel.get(level) ?? []), file]));
    }
  }
}
// A changed scenario whose test file did not change still touches its level.
for (const file of features) for (const s of parseFeature(file)) for (const l of levelOf(s.tags)) if (!testsByLevel.has(l)) testsByLevel.set(l, new Set());

const quote = (f) => (/\s/.test(f) ? `"${f}"` : f);
const node = (script, extra) => ({
  cmd: [process.execPath, path.join(HERE, script), ...extra].map(quote).join(" "),
  shown: [script, ...extra].join(" "),
});
const checks = [];
if (features.length) checks.push({ name: "feature lint", ...node("check-feature.mjs", features) });
if (tests.length) checks.push({ name: "test lint", ...node("check-test.mjs", tests) });
checks.push({ name: "parity", ...node("bdd-parity.mjs", []) });

const skipped = [];
for (const level of cfg.pyramidTags) {
  if (!all && !testsByLevel.has(level)) continue;
  const template = commands[level];
  if (!template) {
    skipped.push(`${level}: no commands.${level} in config`);
    continue;
  }
  const files = all ? [] : [...(testsByLevel.get(level) ?? [])];
  checks.push({ name: `${level} tests`, cmd: template.replace("{files}", files.map(quote).join(" ")).trim() });
}
for (const key of ["lint", "typecheck"]) if (commands[key]) checks.push({ name: key, cmd: commands[key] });

function run({ name, cmd, shown = cmd }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, { cwd: ROOT, shell: true, env: { ...process.env, FORCE_COLOR: "0", CI: "1" } });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ name, cmd: shown, code, output, secs: ((Date.now() - started) / 1000).toFixed(1) }));
  });
}

const results = await Promise.all(checks.map(run));
const failed = results.filter((r) => r.code !== 0);

process.stdout.write(`[bdd:verify] ${all ? "full suite" : `${changed.length} changed file(s)`} · ${results.length} check(s)\n`);
for (const r of results) process.stdout.write(`  ${r.code === 0 ? "ok  " : "FAIL"} ${r.name} (${r.secs}s)  ${r.cmd}\n`);
for (const s of skipped) process.stdout.write(`  skip ${s}\n`);
for (const r of failed) {
  const lines = r.output.trimEnd().split(/\r?\n/);
  process.stdout.write(`\n--- ${r.name} (exit ${r.code}), last ${Math.min(TAIL, lines.length)} lines ---\n${lines.slice(-TAIL).join("\n")}\n`);
}
process.exit(failed.length ? 1 : 0);
