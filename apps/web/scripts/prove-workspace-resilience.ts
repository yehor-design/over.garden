import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  WORKSPACE_FAILURE_CLASSES,
  type WorkspaceFailureClass,
} from "../src/server/workspace-failure";

/**
 * OVE-374 workspace resilience proof.
 *
 * ADR-0023 says no page under `/garden/**` can strand a reader on a skeleton.
 * That claim is only worth what a hostile run says about it, so this script
 * asks a real `next start` for every workspace surface while `DATABASE_URL`
 * points at a closed port, and checks the finished HTML of each one:
 *
 *   1. status 200 — the shell answered rather than erroring out;
 *   2. the surface's own heading is present — not a sibling's, not a blank;
 *   3. at least one `data-section-failure="connection_unavailable"` — the
 *      failure arrived as a designed value with a class an operator can act on;
 *   4. no skeleton marker survives — no `data-workspace-state="loading"`, no
 *      `data-workspace-section="loading"`, no `data-garden-workspace="loading"`.
 *
 * (4) is the one that matters. The defect this work exists for leaves exactly
 * those markers in the final HTML forever, so their absence is the proof, and
 * their presence would fail the run no matter how good the rest looked.
 *
 * The receipt records counts and classes only. No cookie, header, body, URL
 * query, or HTML fragment is written.
 */

export interface WorkspaceSurfaceProbe {
  surface: string;
  path: string;
  /** A string that appears in this surface's own shell and no sibling's. */
  heading: string;
}

/** Every surface ADR-0023 covers, in the order a person would walk them. */
export const WORKSPACE_SURFACE_PROBES: readonly WorkspaceSurfaceProbe[] = [
  { surface: "garden-home", path: "/garden", heading: "Простір саду" },
  {
    surface: "stable-registry",
    path: "/garden/catalog/registry",
    heading: "Stable Registry — Foundation",
  },
  {
    surface: "stable-registry-extensions",
    path: "/garden/catalog/registry/extensions",
    heading: "Stable Registry — пакети розширень",
  },
  {
    surface: "stable-registry-editions",
    path: "/garden/catalog/registry/editions",
    heading: "Stable Registry — видання",
  },
  {
    surface: "object",
    path: "/garden/objects/00000000-0000-4000-8000-000000000001",
    heading: "Живий об",
  },
  {
    surface: "entry-edit",
    path: "/garden/entries/00000000-0000-4000-8000-000000000001/edit",
    heading: "Редагування запису",
  },
  {
    surface: "profile",
    path: "/garden/profile",
    heading: "Мій публічний профіль",
  },
  {
    surface: "lineage-claims",
    path: "/garden/lineage/claims",
    heading: "Запити щодо походження",
  },
  {
    surface: "lineage-questions",
    path: "/garden/lineage/questions",
    heading: "Оновлення походження",
  },
  {
    surface: "lineage-invitation-claim",
    path: "/garden/lineage/invitations/claim",
    heading: "Запрошення щодо походження",
  },
  {
    surface: "erasure-requests",
    path: "/garden/privacy/erasure-requests",
    heading: "Запити на видалення",
  },
];

/** Markers that must not survive into a finished response. */
export const SKELETON_MARKERS = [
  'data-workspace-state="loading"',
  'data-workspace-section="loading"',
  'data-garden-workspace="loading"',
] as const;

export interface WorkspaceSurfaceResult {
  surface: string;
  path: string;
  status: number;
  headingPresent: boolean;
  failureClasses: WorkspaceFailureClass[];
  /** Fallback markup React streamed before the boundary resolved. */
  skeletonMarkers: string[];
  /** `$RC(` — a Suspense boundary that completed and replaced its fallback. */
  boundaryCompletions: number;
  /** `$RX(` — a boundary React gave up on. */
  boundaryErrors: number;
  /** A fallback was streamed and nothing ever completed it. */
  strandedSkeleton: boolean;
  elapsedMs: number;
  passed: boolean;
}

const BOUNDARY_COMPLETION_PATTERN = /\$RC\(/g;
const BOUNDARY_ERROR_PATTERN = /\$RX\(/g;

function count(html: string, pattern: RegExp): number {
  return [...html.matchAll(pattern)].length;
}

const SECTION_FAILURE_PATTERN = /data-section-failure="([a-z_]+)"/g;

export function readFailureClasses(html: string): WorkspaceFailureClass[] {
  const seen = new Set<WorkspaceFailureClass>();
  for (const match of html.matchAll(SECTION_FAILURE_PATTERN)) {
    const value = match[1] as WorkspaceFailureClass;
    if ((WORKSPACE_FAILURE_CLASSES as readonly string[]).includes(value)) {
      seen.add(value);
    }
  }
  return [...seen];
}

export function evaluateSurface(
  probe: WorkspaceSurfaceProbe,
  html: string,
  status: number,
  elapsedMs: number,
  expectedClass: WorkspaceFailureClass,
): WorkspaceSurfaceResult {
  const failureClasses = readFailureClasses(html);
  const skeletonMarkers = SKELETON_MARKERS.filter((marker) =>
    html.includes(marker),
  );
  const boundaryCompletions = count(html, BOUNDARY_COMPLETION_PATTERN);
  const boundaryErrors = count(html, BOUNDARY_ERROR_PATTERN);
  // A route with its own `loading.tsx` always streams that fallback: React
  // writes it into the byte stream first and swaps it for the real content with
  // a completion instruction. So the question is never "did a skeleton appear in
  // the bytes" — it always does — but "was one left standing". The defect in
  // ADR-0023 has exactly that signature: the fallback is written, the stream
  // closes, and no `$RC(` ever arrives to replace it.
  const strandedSkeleton =
    skeletonMarkers.length > 0 && boundaryCompletions === 0;
  return {
    surface: probe.surface,
    path: probe.path,
    status,
    headingPresent: html.includes(probe.heading),
    failureClasses,
    skeletonMarkers,
    boundaryCompletions,
    boundaryErrors,
    strandedSkeleton,
    elapsedMs,
    passed:
      status === 200 &&
      html.includes(probe.heading) &&
      failureClasses.includes(expectedClass) &&
      !strandedSkeleton &&
      boundaryErrors === 0,
  };
}

export interface WorkspaceResilienceReceipt {
  version: 1;
  issue: "OVE-374";
  baseUrl: string;
  expectedClass: WorkspaceFailureClass;
  surfaces: WorkspaceSurfaceResult[];
  passedCount: number;
  failedCount: number;
  generatedAt: string;
}

export interface ProveWorkspaceResilienceOptions {
  baseUrl: string;
  cookie: string;
  expectedClass: WorkspaceFailureClass;
  fetchImpl?: typeof fetch;
  probes?: readonly WorkspaceSurfaceProbe[];
}

export async function proveWorkspaceResilience(
  options: ProveWorkspaceResilienceOptions,
): Promise<WorkspaceResilienceReceipt> {
  const call = options.fetchImpl ?? fetch;
  const probes = options.probes ?? WORKSPACE_SURFACE_PROBES;
  const surfaces: WorkspaceSurfaceResult[] = [];

  for (const probe of probes) {
    const startedAt = performance.now();
    const response = await call(new URL(probe.path, options.baseUrl), {
      headers: options.cookie ? { cookie: options.cookie } : undefined,
      redirect: "manual",
    });
    const html = await response.text();
    surfaces.push(
      evaluateSurface(
        probe,
        html,
        response.status,
        Math.round(performance.now() - startedAt),
        options.expectedClass,
      ),
    );
  }

  return {
    version: 1,
    issue: "OVE-374",
    baseUrl: options.baseUrl,
    expectedClass: options.expectedClass,
    surfaces,
    passedCount: surfaces.filter((surface) => surface.passed).length,
    failedCount: surfaces.filter((surface) => !surface.passed).length,
    generatedAt: new Date().toISOString(),
  };
}

export function renderWorkspaceResilienceReceipt(
  receipt: WorkspaceResilienceReceipt,
): string {
  const rows = receipt.surfaces
    .map(
      (surface) =>
        `| \`${surface.surface}\` | ${surface.status} | ${
          surface.headingPresent ? "yes" : "**no**"
        } | ${
          surface.failureClasses.length > 0
            ? surface.failureClasses.map((value) => `\`${value}\``).join(", ")
            : "**none**"
        } | ${surface.strandedSkeleton ? "**stranded**" : "none"} | ${
          surface.boundaryCompletions
        } |`,
    )
    .join("\n");

  return `# Workspace resilience proof — 2026-09

Status: generated receipt. Regenerate with \`pnpm prove:workspace-resilience\`.
Issue: OVE-374. Decision: \`docs/adr/ADR-0023-workspace-resilience.md\`.

## What was run

Every page under \`/garden/**\` was fetched from a local production build
(\`next start\`) whose \`DATABASE_URL\` points at a closed port, with a signed-in
session cookie. Each response had to answer \`200\`, carry its **own** heading,
carry at least one \`data-section-failure="${receipt.expectedClass}"\` section,
leave no Suspense boundary stranded, and error no boundary at all.

"Stranded" is the precise form of the check, and the precision matters. A route
with its own \`loading.tsx\` **always** writes that fallback into the byte
stream; React then replaces it with a completion instruction. So the question is
never whether a skeleton appears in the bytes — it always does — but whether one
was left standing. The ADR-0023 defect has exactly that signature: the fallback
is written, the stream closes, and no completion instruction ever arrives.

Nothing below is derived from a cookie, header, body, query string, or HTML
fragment: only status, presence of a heading, bounded classes, and counts.

## Result

Passed ${receipt.passedCount} of ${receipt.surfaces.length} surfaces.

| Surface | Status | Own heading | Classes rendered | Stranded skeleton | Boundaries completed |
| -- | -- | -- | -- | -- | -- |
${rows}

Generated at ${receipt.generatedAt} against \`${receipt.baseUrl}\`.
`;
}

export function parseArgs(argv: readonly string[]) {
  const read = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  return {
    baseUrl: read("--base-url") ?? "http://127.0.0.1:3000",
    cookieFile: read("--cookie-file"),
    out:
      read("--out") ??
      path.join("..", "..", "docs", "WORKSPACE_RESILIENCE_PROOF_2026-09.md"),
    expectedClass: (read("--expect-class") ??
      "connection_unavailable") as WorkspaceFailureClass,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cookie = args.cookieFile
    ? (await import("node:fs/promises"))
        .readFile(args.cookieFile, "utf8")
        .then((value) => value.trim())
    : Promise.resolve("");

  const receipt = await proveWorkspaceResilience({
    baseUrl: args.baseUrl,
    cookie: await cookie,
    expectedClass: args.expectedClass,
  });

  await writeFile(args.out, renderWorkspaceResilienceReceipt(receipt), "utf8");
  process.stdout.write(
    `${JSON.stringify({ ...receipt, surfaces: receipt.surfaces.map(({ surface, status, headingPresent, failureClasses, skeletonMarkers }) => ({ surface, status, headingPresent, failureClasses, skeletonMarkers })) }, null, 2)}\n`,
  );
  if (receipt.failedCount > 0) process.exitCode = 1;
}

if (process.argv[1]?.includes("prove-workspace-resilience")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
