/**
 * Gate 14 — no `@/server/*` read is awaited outside `settleSection` on a
 * workspace render path (`AGENTS.md` hard rule 11, ADR-0023, `OVE-457`).
 *
 * The rule exists because of a framework defect that is still unfixed
 * upstream: under Cache Components a Server Component that throws while a
 * postponed response is resumed leaves its Suspense boundary pending forever
 * on a **hard load**. No `$RX` instruction is written, `error.tsx` never
 * renders, and the reader keeps the skeleton. So a workspace failure has to be
 * a *value*, and `settleSection` is the only thing that turns one into one.
 *
 * Reading the rule is not enough to keep it: an escape looks exactly like
 * every other `await`, and it only shows on a hard load with the dependency
 * already broken. `getPublicAuthorHandle` had been awaited bare on the living
 * object's page since the addresses moved under authors, and nothing saw it.
 *
 * ## What it checks, and how it reads a file
 *
 * 1. **Settle wrappers** are `settleSection` and any local `async function`
 *    whose own body calls one. That second clause is what lets a page keep a
 *    `settledOrNull` helper without the gate losing track.
 * 2. **Settled ranges** are the argument spans of every call to a wrapper, so
 *    anything inside `settleSection(async () => { … })` is settled.
 * 3. A local async function that is **not exported** and whose every call site
 *    is inside a settled range is itself settled, and so is its body. One
 *    level of indirection, resolved to a fixed point.
 * 4. Anything else that `await`s a binding imported from `@/server/*` is a
 *    violation, unless the binding is on the allowlist below.
 *
 * Server Actions are out of scope and their files are skipped: a mutation is
 * not a render, nothing is postponed around it, and a thrown action reaches
 * the caller as a rejected promise rather than as a boundary that never
 * resolves.
 *
 * Usage: `pnpm check:workspace-settled-reads`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/** The trees a workspace document is rendered from. */
export const WORKSPACE_RENDER_ROOTS = [
  "src/app/(default)/garden",
  "src/components/garden",
] as const;

/** The one function that turns a rejection into a rendered value. */
export const SETTLE_ENTRY_POINT = "settleSection";

/**
 * Reads a workspace render path may await bare, and why each one is safe.
 * Every entry is a claim somebody can check; adding one is a decision, not a
 * convenience.
 */
export const UNSETTLED_READ_ALLOWLIST: Readonly<Record<string, string>> = {
  getRequestInterfaceLocale:
    "reads the request's cookies and headers; it never opens a connection",
  getRequestInterfaceLocalization:
    "reads the request's cookies and headers; it never opens a connection",
  resolveWorkspaceViewer:
    "the one read ADR-0023 allows before a shell, and it settles its own two queries",
  resolveWorkspaceAdminAccess:
    "settles the owner check itself and returns `unavailable` as a value",
  recordAnalyticsEventSafely:
    "swallows its own failure by construction; the name is the contract",
  [SETTLE_ENTRY_POINT]: "is the wrapper",
};

export interface UnsettledRead {
  file: string;
  line: number;
  name: string;
}

interface Range {
  start: number;
  end: number;
}

function inAnyRange(offset: number, ranges: readonly Range[]) {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

/** The span between the parenthesis after `at` and its match. */
function argumentRange(source: string, openParen: number): Range | null {
  let depth = 0;
  for (let index = openParen; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return { start: openParen + 1, end: index };
    }
  }
  return null;
}

/**
 * The body of the `function` declaration that starts at `at`.
 *
 * Not "the first `{` after the name": a destructured parameter list opens one
 * first, and taking it made every page component's body six lines long and
 * step 3 blind. This skips the parameter list by matching its parentheses, and
 * then skips a return type's own braces by tracking `<…>` depth.
 */
function bodyRange(source: string, declarationStart: number): Range | null {
  const paramStart = source.indexOf("(", declarationStart);
  if (paramStart < 0) return null;
  const params = argumentRange(source, paramStart);
  if (!params) return null;
  let angle = 0;
  let brace = -1;
  for (let index = params.end + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === "<") angle += 1;
    else if (character === ">") angle = Math.max(0, angle - 1);
    else if (character === "{" && angle === 0) {
      brace = index;
      break;
    }
  }
  if (brace < 0) return null;
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return { start: brace, end: index };
    }
  }
  return null;
}

/**
 * Where this name is *called*. A declaration's own parameter list looks like a
 * call and is not one — counting it made every private helper look as though
 * it had one unsettled caller.
 */
function callSites(source: string, name: string): number[] {
  const pattern = new RegExp(
    `(?<!function\\s)(?<![\\w$.])${escape(name)}\\s*\\(`,
    "gu",
  );
  return [...source.matchAll(pattern)].map(
    (match) => match.index + match[0].length - 1,
  );
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function findUnsettledReads(
  file: string,
  source: string,
): UnsettledRead[] {
  const serverBindings = new Set<string>();
  for (const match of source.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@\/server\/[^"]+"/gu,
  )) {
    for (const specifier of (match[1] ?? "").split(",")) {
      const trimmed = specifier.trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      serverBindings.add(trimmed.split(/\s+as\s+/u).at(-1)!.trim());
    }
  }
  if (serverBindings.size === 0) return [];

  // Local async functions, by name, with where their body is and whether the
  // file hands them out.
  const locals = new Map<string, { body: Range; exported: boolean }>();
  for (const match of source.matchAll(
    /(export\s+)?async\s+function\s+([A-Za-z_$][\w$]*)/gu,
  )) {
    const body = bodyRange(source, match.index);
    if (!body) continue;
    locals.set(match[2]!, { body, exported: Boolean(match[1]) });
  }

  // 1 + 2: the wrappers, grown to a fixed point, and the ranges they settle.
  const wrappers = new Set<string>([SETTLE_ENTRY_POINT]);
  for (let pass = 0; pass < locals.size + 1; pass += 1) {
    let grew = false;
    for (const [name, local] of locals) {
      if (wrappers.has(name)) continue;
      const callsAWrapper = [...wrappers].some((wrapper) =>
        callSites(source, wrapper).some(
          (at) => at > local.body.start && at < local.body.end,
        ),
      );
      if (callsAWrapper) {
        wrappers.add(name);
        grew = true;
      }
    }
    if (!grew) break;
  }
  const settled: Range[] = [];
  for (const wrapper of wrappers) {
    for (const at of callSites(source, wrapper)) {
      const range = argumentRange(source, at);
      if (range) settled.push(range);
    }
  }

  // 3: a private helper every call of which is already settled is settled too.
  for (let pass = 0; pass < locals.size + 1; pass += 1) {
    let grew = false;
    for (const [name, local] of locals) {
      if (wrappers.has(name) || local.exported) continue;
      if (inAnyRange(local.body.start, settled)) continue;
      const calls = callSites(source, name).filter(
        (at) => at < local.body.start || at > local.body.end,
      );
      if (calls.length > 0 && calls.every((at) => inAnyRange(at, settled))) {
        settled.push(local.body);
        grew = true;
      }
    }
    if (!grew) break;
  }

  // 4: what is left.
  const violations: UnsettledRead[] = [];
  for (const name of serverBindings) {
    if (name in UNSETTLED_READ_ALLOWLIST) continue;
    for (const match of source.matchAll(
      new RegExp(`await\\s+${escape(name)}\\s*\\(`, "gu"),
    )) {
      if (inAnyRange(match.index, settled)) continue;
      violations.push({
        file,
        line: source.slice(0, match.index).split("\n").length,
        name,
      });
    }
  }
  return violations.sort((a, b) => a.line - b.line);
}

/** A Server Action file: a mutation, not a render. */
export function isServerActionModule(file: string) {
  return /(^|\/)[\w-]*actions?\.ts$/u.test(file);
}

export function isWorkspaceRenderModule(file: string) {
  if (file.includes(".test.")) return false;
  if (isServerActionModule(file)) return false;
  return file.endsWith(".tsx") || file.endsWith(".ts");
}

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

export function runWorkspaceSettledReadGate(root: string) {
  const violations: UnsettledRead[] = [];
  let scanned = 0;
  for (const tree of WORKSPACE_RENDER_ROOTS) {
    const directory = join(root, tree);
    for (const full of walk(directory)) {
      const file = relative(root, full);
      if (!isWorkspaceRenderModule(file)) continue;
      scanned += 1;
      violations.push(...findUnsettledReads(file, readFileSync(full, "utf8")));
    }
  }
  return { scanned, violations };
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { scanned, violations } = runWorkspaceSettledReadGate(root);
  for (const violation of violations) {
    console.error(
      `${violation.file}:${violation.line}  await ${violation.name}(…) is not inside ${SETTLE_ENTRY_POINT}().\n` +
        `  A workspace render path settles every @/server/* read (AGENTS.md rule 11, ADR-0023).\n` +
        `  Write: const settled = await ${SETTLE_ENTRY_POINT}(() => ${violation.name}(…), { surface, section });\n` +
        `  then render settled.status === "error" as a designed state.`,
    );
  }
  console.log(
    `workspace settled-read gate: ${scanned} render modules scanned, ` +
      `${violations.length} unsettled read(s)`,
  );
  if (violations.length > 0) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
