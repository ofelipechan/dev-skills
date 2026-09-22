#!/usr/bin/env node
// PostToolUse hook (Write|Edit) and CLI: lint a test file.
// Errors:
//   - it()/test() title starts with "should"
//   - it.skip/it.todo that carries a binding (use @unimplemented on the scenario instead)
//   - @scenario title that does not match any Scenario in specs byte-for-byte
//   - the same scenario bound twice (across all test files)
//
// CLI:   node <agent runtime dir>/check-test.mjs [file ...]   (no args = all test files)
// Hook:  --hook  reads {tool_input.file_path} from stdin.
import fs from "node:fs";
import {
  loadConfig, readStdinJson, toRel, isTestFile, listTestFiles, parseTestFile, collectScenarios, finish,
} from "./bdd-lib.mjs";

const cfg = loadConfig();
const isHook = process.argv.includes("--hook");
let files;

if (isHook) {
  const input = readStdinJson();
  const fp = input?.tool_input?.file_path;
  if (!fp) process.exit(0);
  const rel = toRel(fp);
  if (!isTestFile(rel, cfg) || !fs.existsSync(fp)) process.exit(0);
  files = [rel];
} else {
  const cli = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  files = cli.length ? cli.map(toRel) : listTestFiles(cfg);
}

const scenarios = collectScenarios(cfg);
const titles = new Set(scenarios.map((s) => s.title));
const errors = [];
const warnings = [];

// Global duplicate detection needs every test file, not only the touched one.
const allBindings = listTestFiles(cfg).flatMap((f) => parseTestFile(f).bindings);
const byScenario = new Map();
for (const b of allBindings) byScenario.set(b.scenario, [...(byScenario.get(b.scenario) ?? []), b]);

for (const rel of files) {
  const { bindings, tests } = parseTestFile(rel);

  for (const t of tests) {
    const loc = `${rel}:${t.line}`;
    if (/^should\b/i.test(t.title)) {
      const fixed = t.title.replace(/^should\s+/i, "");
      errors.push(`${loc} title starts with "should": "${t.title}" -> use present tense ("${fixed}")`);
    }
    if ((t.kind === ".skip" || t.kind === ".todo") && t.hasBinding) {
      errors.push(`${loc} ${t.kind} test carries a @scenario binding; remove it and tag the scenario @${cfg.unimplementedTag}`);
    }
    // A test without a binding is allowed (§ 8 material, helpers, extra invariants).
  }

  for (const b of bindings) {
    const loc = `${rel}:${b.line}`;
    if (!titles.has(b.scenario)) {
      const near = scenarios.find((s) => s.title.toLowerCase() === b.scenario.toLowerCase());
      const hint = near ? ` (case differs from "${near.title}" in ${near.file}:${near.line})` : "";
      errors.push(`${loc} @scenario "${b.scenario}" matches no Scenario in ${cfg.specsDir}/${hint}`);
    }
    const dups = byScenario.get(b.scenario) ?? [];
    if (dups.length > 1) {
      const others = dups.filter((d) => !(d.file === rel && d.line === b.line)).map((d) => `${d.file}:${d.line}`);
      errors.push(`${loc} scenario "${b.scenario}" is bound ${dups.length} times (also at ${others.join(", ")})`);
    }
  }
  // A bound scenario may still carry @unimplemented: the test exists but production code
  // is not green yet. /bdd drops the tag per scenario during Implement, so no warning here.
}

if (!isHook && errors.length === 0) {
  process.stdout.write(`[bdd:test] ${files.length} file(s) ok, ${warnings.length} warning(s)\n`);
  for (const w of warnings) process.stdout.write("  - " + w + "\n");
  process.exit(0);
}
finish({ errors, warnings, label: "bdd:test" });
