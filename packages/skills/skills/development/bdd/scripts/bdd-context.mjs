#!/usr/bin/env node
// One-call BDD context for Discovery: preflight status, config, commands, spec layout,
// scenarios matching keywords, @unimplemented backlog, and parity gaps.
//
//   node <dir>/bdd-context.mjs --agent claude|codex [keyword ...]
//
// `run` is the saved /bdd run state (bdd-state.mjs), null when none — resume from it.
// Keywords match scenario titles and feature file paths, case-insensitively (any keyword).
// Exit code mirrors preflight: 0 complete, 1 incomplete, 2 invalid.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, collectScenarios, collectBindings, listFeatureFiles, readState } from "./bdd-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const agentIdx = args.indexOf("--agent");
const agent = agentIdx === -1 ? undefined : args[agentIdx + 1];
const keywords = args
  .filter((a, i) => !a.startsWith("--") && i !== agentIdx + 1)
  .map((k) => k.toLowerCase());

function preflight() {
  const flags = agent ? ["--agent", agent] : [];
  try {
    return { code: 0, report: JSON.parse(execFileSync(process.execPath, [path.join(HERE, "bdd-preflight.mjs"), ...flags], { encoding: "utf8" })) };
  } catch (error) {
    try {
      return { code: error.status ?? 2, report: JSON.parse(error.stdout) };
    } catch {
      return { code: 2, report: { error: String(error.message) } };
    }
  }
}

const pre = preflight();
if (pre.code !== 0) {
  process.stdout.write(JSON.stringify({ preflight: pre.report }, null, 2) + "\n");
  process.exit(pre.code);
}

const cfg = loadConfig();
const scenarios = collectScenarios(cfg);
const bound = new Set(collectBindings(cfg).map((b) => b.scenario));
const titles = new Set(scenarios.map((s) => s.title));
const brief = (s) => `${s.file}:${s.line} [${s.tags.map((t) => "@" + t).join(" ")}] ${s.title}`;

const contexts = {};
for (const file of listFeatureFiles(cfg)) {
  const ctx = file.slice(cfg.specsDir.length + 1).split("/")[0];
  (contexts[ctx] ??= []).push(file);
}

const matches = keywords.length
  ? scenarios.filter((s) => keywords.some((k) => s.title.toLowerCase().includes(k) || s.file.toLowerCase().includes(k))).map(brief)
  : [];
const unimplemented = scenarios.filter((s) => s.tags.includes(cfg.unimplementedTag));
const orphan = collectBindings(cfg).filter((b) => !titles.has(b.scenario));

const out = {
  preflight: pre.report,
  run: readState(),
  config: { specsDir: cfg.specsDir, pyramidTags: cfg.pyramidTags, testGlobs: cfg.testGlobs, commands: cfg.commands },
  contexts,
  scenarios: scenarios.length,
  matches,
  backlog: unimplemented.map((s) => `${brief(s)}${bound.has(s.title) ? "  (bound)" : ""}`),
  parity: {
    unbound: scenarios.filter((s) => !s.tags.includes(cfg.unimplementedTag) && !bound.has(s.title)).map(brief),
    orphan: orphan.map((b) => `${b.file}:${b.line} "${b.scenario}"`),
  },
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
