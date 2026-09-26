#!/usr/bin/env node
// Remove the @unimplemented tag from the named scenarios in one call.
// Call it only for scenarios whose bound test is green.
//
//   node <dir>/bdd-untag.mjs "<scenario title>" ["<scenario title>" ...]
//
// Exit 1 when a title matches no scenario or has no bound test (nothing is written for that title).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, collectScenarios, collectBindings } from "./bdd-lib.mjs";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const cfg = loadConfig();
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!wanted.length) {
  process.stderr.write('usage: bdd-untag.mjs "<scenario title>" ...\n');
  process.exit(2);
}

const scenarios = collectScenarios(cfg);
const bound = new Set(collectBindings(cfg).map((b) => b.scenario));
const byFile = new Map();
const missing = [];
const unbound = [];
for (const title of wanted) {
  const s = scenarios.find((x) => x.title === title);
  if (!s) missing.push(title);
  else if (!bound.has(title)) unbound.push(title);
  else if (s.tags.includes(cfg.unimplementedTag)) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
}

const tag = "@" + cfg.unimplementedTag;
const untagged = [];
for (const [file, list] of byFile) {
  const abs = path.join(ROOT, file);
  const raw = fs.readFileSync(abs, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const drop = new Set();
  for (const s of list) {
    // Walk the tag block above the Scenario line (1-based line → index line-2 upward).
    for (let i = s.line - 2; i >= 0; i--) {
      const t = lines[i].trim();
      if (t === "" || t.startsWith("#")) continue;
      if (!t.startsWith("@")) break;
      const tokens = t.split(/\s+/);
      const kept = tokens.filter((tok) => tok !== tag);
      if (kept.length === tokens.length) continue;
      if (kept.length === 0) drop.add(i);
      else lines[i] = lines[i].match(/^\s*/)[0] + kept.join(" ");
    }
    untagged.push(s.title);
  }
  fs.writeFileSync(abs, lines.filter((_, i) => !drop.has(i)).join(eol));
}

process.stdout.write(`[bdd:untag] ${untagged.length} untagged\n`);
for (const t of untagged) process.stdout.write(`  - ${t}\n`);
if (unbound.length) {
  process.stderr.write(`[bdd:untag] no bound test, tag kept:\n${unbound.map((t) => `  - "${t}"`).join("\n")}\n`);
}
if (missing.length) {
  process.stderr.write(`[bdd:untag] no scenario titled:\n${missing.map((t) => `  - "${t}"`).join("\n")}\n`);
}
if (missing.length || unbound.length) process.exit(1);
