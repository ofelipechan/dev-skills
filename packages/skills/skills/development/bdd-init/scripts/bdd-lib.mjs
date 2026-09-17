// Shared helpers for the BDD hooks. Zero dependencies; Node >= 18.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CONFIG_PATH = path.join(ROOT, ".claude", "bdd.config.json");

const DEFAULTS = {
  specsDir: "specs",
  testGlobs: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
  ignoreDirs: ["node_modules", "dist", "build", ".next", "coverage", ".git"],
  pyramidTags: ["unit", "integration", "e2e"],
  modifierTags: ["regression", "unimplemented"],
  unimplementedTag: "unimplemented",
  phrasingBanlist: [],
};

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return { ...DEFAULTS };
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  return { ...DEFAULTS, ...raw };
}

export function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function toRel(p) {
  return path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join("/");
}

// Minimal glob: supports "**/" segments, "*" within a segment and "{a,b}" alternation.
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (glob.startsWith("**/", i)) {
      re += "(?:.*/)?";
      i += 2;
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      const alts = glob.slice(i + 1, end).split(",").map(escapeRe);
      re += "(?:" + alts.join("|") + ")";
      i = end;
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp("^" + re + "$");
}

function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\?]/g, (m) => "\\" + m);
}

export function walk(dir, { ignoreDirs }, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = toRel(full);
    if (entry.isDirectory()) {
      if (ignoreDirs.some((ig) => rel === ig || rel.startsWith(ig + "/") || entry.name === ig)) continue;
      walk(full, { ignoreDirs }, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

export function listFeatureFiles(cfg) {
  return walk(path.join(ROOT, cfg.specsDir), cfg).filter((f) => f.endsWith(".feature"));
}

export function listTestFiles(cfg) {
  const regexes = cfg.testGlobs.map(globToRegex);
  return walk(ROOT, cfg).filter((f) => regexes.some((r) => r.test(f)));
}

export function isTestFile(rel, cfg) {
  return cfg.testGlobs.map(globToRegex).some((r) => r.test(rel));
}

export function isFeatureFile(rel, cfg) {
  return rel.endsWith(".feature") && rel.startsWith(cfg.specsDir + "/");
}

/**
 * Parse a .feature file into scenarios: { title, line, tags[], file }.
 * Tags are collected from @-lines directly above the Scenario line
 * (blank lines and comments in between are allowed).
 */
export function parseFeature(rel) {
  const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
  const scenarios = [];
  let pendingTags = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("@")) {
      pendingTags.push(...trimmed.split(/\s+/).filter((t) => t.startsWith("@")).map((t) => t.slice(1)));
      continue;
    }
    const m = trimmed.match(/^Scenario(?: Outline)?:\s*(.+?)\s*$/);
    if (m) {
      scenarios.push({ title: m[1], line: i + 1, tags: pendingTags, file: rel });
      pendingTags = [];
      continue;
    }
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (/^(Feature|Background|Rule|Examples):/.test(trimmed)) pendingTags = [];
  }
  return scenarios;
}

const BINDING_RE = /@scenario\s+"([^"]+)"/;
const TEST_RE = /^\s*(?:it|test)(\.each\b[^(]*\([^)]*\)|\.skip|\.todo|\.only)?\s*\(\s*(["'`])((?:\\.|(?!\2).)*)\2/;

// Does the JSDoc block ending right above `lineIdx` contain a @scenario binding?
function bindingAbove(lines, lineIdx) {
  let j = lineIdx - 1;
  while (j >= 0 && /^\s*$/.test(lines[j])) j--;
  if (j < 0 || !/\*\/\s*$/.test(lines[j])) return false;
  while (j >= 0) {
    if (BINDING_RE.test(lines[j])) return true;
    if (/\/\*\*/.test(lines[j])) return false;
    j--;
  }
  return false;
}

/**
 * Parse a test file.
 * bindings: { scenario, line, file }          — every `@scenario "<title>"`
 * tests:    { title, line, kind, hasBinding }  — each it()/test() call
 */
export function parseTestFile(rel) {
  const lines = fs.readFileSync(path.join(ROOT, rel), "utf8").split(/\r?\n/);
  const bindings = [];
  const tests = [];

  for (let i = 0; i < lines.length; i++) {
    const b = lines[i].match(BINDING_RE);
    if (b) bindings.push({ scenario: b[1], line: i + 1, file: rel });
  }

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TEST_RE);
    if (!m) continue;
    const kind = m[1] ? m[1].replace(/\(.*$/, "").replace(/\s+/g, "") : "";
    let hasBinding = bindingAbove(lines, i);
    if (!hasBinding && /\.each\b/.test(lines[i]) === false) {
      // `it.each([...])("title", ...)` spread over lines: title line differs from the it.each line.
      let k = i;
      while (k >= 0 && !/^\s*(?:it|test)\.each\b/.test(lines[k])) k--;
      if (k >= 0 && k !== i) hasBinding = bindingAbove(lines, k);
    }
    tests.push({ title: m[3], line: i + 1, kind, hasBinding, file: rel });
  }
  return { bindings, tests };
}

export function collectScenarios(cfg) {
  return listFeatureFiles(cfg).flatMap(parseFeature);
}

export function collectBindings(cfg) {
  return listTestFiles(cfg).flatMap((f) => parseTestFile(f).bindings);
}

export function phrasingViolations(text, cfg) {
  const out = [];
  for (const rule of cfg.phrasingBanlist) {
    const m = text.match(new RegExp(rule.pattern, rule.flags ?? "i"));
    if (m) out.push({ match: m[0], hint: rule.hint });
  }
  return out;
}

// Emit feedback. errors -> exit 2 (stderr is fed back to the model).
// warnings only -> stdout JSON additionalContext (PostToolUse).
export function finish({ errors = [], warnings = [], label = "bdd" }) {
  const fmt = (arr) => arr.map((e) => "  - " + e).join("\n");
  if (errors.length) {
    process.stderr.write(`[${label}] ${errors.length} error(s):\n${fmt(errors)}\n`);
    if (warnings.length) process.stderr.write(`[${label}] warnings:\n${fmt(warnings)}\n`);
    process.exit(2);
  }
  if (warnings.length) {
    const out = { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `[${label}] warnings:\n${fmt(warnings)}` } };
    process.stdout.write(JSON.stringify(out) + "\n");
  }
  process.exit(0);
}
