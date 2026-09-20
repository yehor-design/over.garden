/**
 * One fault-injection run per `WorkspaceFailureClass`, on a hard load
 * (`OVE-457`, ADR-0023).
 *
 * `prove-workspace-resilience.ts` walks every workspace surface with one fault:
 * `DATABASE_URL` on a closed port, which is `connection_unavailable`. That
 * proves the surfaces. It does not prove the **classes** — five of the six had
 * never been produced by anything but a unit test of the classifier, and a
 * class whose designed state nobody has seen is a class nobody has designed.
 *
 * ## How the fault is injected
 *
 * At the database, as a real SQLSTATE through the real driver:
 *
 * ```sql
 * alter table plant_objects rename to plant_objects_real;
 * create function raise_ove457() returns setof plant_objects_real
 *   language plpgsql as $$
 *   begin raise exception 'injected' using errcode = '40001'; end $$;
 * create view plant_objects as select * from raise_ove457();
 * ```
 *
 * The view has the table's columns, so every statement the workspace writes
 * still parses; selecting from it raises the chosen code. Nothing in the
 * application knows this exists, which is the point: the driver, the classifier
 * and the page all behave exactly as they would in the real outage.
 *
 * A **set-returning** function in `from`, not a boolean in `where`: a qualifier
 * is evaluated per row, and the first spelling of this raised nothing at all
 * against an empty table — which is exactly the state a fresh gardener's
 * workspace is in, so the proof passed five classes by rendering none of them.
 *
 * ## What is asserted, and why it is a hard load
 *
 * Each probe is a plain document request — which is what a hard load is — and
 * each has to answer `200`, carry the surface's own heading, carry
 * `data-section-failure="<the class>"`, leave no Suspense boundary stranded
 * (`$RC(` present wherever a skeleton marker is) and error no boundary at all
 * (`$RX(` absent). The defect this whole contract exists for has exactly the
 * stranded signature, and it only reproduces on a hard load: clicking through
 * from another page renders a working `error.tsx` and proves nothing.
 *
 *   pnpm build && pnpm prove:workspace-failure-classes \
 *     --base-url http://127.0.0.1:3179 --cookie-file <file>
 *
 * The receipt records a class, a status and counts. No cookie, header, body,
 * query string or HTML fragment is written.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { Pool } from "pg";

import {
  WORKSPACE_FAILURE_CLASSES,
  type WorkspaceFailureClass,
} from "../src/server/workspace-failure";
import {
  evaluateSurface,
  type WorkspaceSurfaceProbe,
  type WorkspaceSurfaceResult,
} from "./prove-workspace-resilience";

/**
 * The SQLSTATE that produces each class, and the one class that cannot be
 * produced this way.
 *
 * `connection_unavailable` is deliberately not a `raise`: the honest injection
 * for it is a connection that is not there, which is what
 * `prove-workspace-resilience.ts` already runs across every surface. A
 * `raise … using errcode = '08006'` would exercise the classifier's table and
 * nothing else.
 */
export const INJECTED_SQLSTATE: Readonly<
  Partial<Record<WorkspaceFailureClass, string>>
> = {
  permission_denied: "42501",
  schema_missing: "42P01",
  query_timeout: "57014",
  serialization_failure: "40001",
  // Any code the classifier does not know. `P0001` is plpgsql's own
  // `raise_exception`, which is the most ordinary unknown there is.
  unknown: "P0001",
};

/** The surface every class is probed on: the home reads the injected table. */
export const CLASS_PROBE: WorkspaceSurfaceProbe = {
  surface: "garden-home",
  path: "/garden",
  heading: "Простір саду",
};

const INJECTED_TABLE = "plant_objects";
const SHADOW_TABLE = "plant_objects_ove457_real";
const RAISE_FUNCTION = "ove457_injected_failure";

export interface FailureClassResult extends WorkspaceSurfaceResult {
  failureClass: WorkspaceFailureClass;
  sqlstate: string;
}

export interface FailureClassReceipt {
  version: 1;
  issue: "OVE-457";
  baseUrl: string;
  classes: FailureClassResult[];
  passedCount: number;
  failedCount: number;
  generatedAt: string;
}

async function injectFault(pool: Pool, sqlstate: string) {
  await pool.query(`alter table ${INJECTED_TABLE} rename to ${SHADOW_TABLE}`);
  await pool.query(
    `create or replace function ${RAISE_FUNCTION}() returns setof ${SHADOW_TABLE}
     language plpgsql as $$
     begin raise exception 'ove457 injected fault' using errcode = '${sqlstate}'; end $$`,
  );
  await pool.query(
    `create view ${INJECTED_TABLE} as select * from ${RAISE_FUNCTION}()`,
  );
}

async function removeFault(pool: Pool) {
  // `drop view if exists` still fails when the name is a table, which it is
  // before the first injection and after every clean-up.
  await pool.query(
    `do $$ begin
       if (select relkind from pg_class
           where oid = to_regclass('public.${INJECTED_TABLE}')) = 'v' then
         execute 'drop view ${INJECTED_TABLE}';
       end if;
     end $$`,
  );
  // The function returns the shadow table's row type, so it goes before the
  // rename puts that type back under the original name.
  await pool.query(`drop function if exists ${RAISE_FUNCTION}()`);
  await pool.query(
    `do $$ begin
       if to_regclass('public.${SHADOW_TABLE}') is not null then
         execute 'alter table ${SHADOW_TABLE} rename to ${INJECTED_TABLE}';
       end if;
     end $$`,
  );
}

export async function proveWorkspaceFailureClasses(options: {
  baseUrl: string;
  cookie: string;
  databaseUrl: string;
}): Promise<FailureClassReceipt> {
  const pool = new Pool({ connectionString: options.databaseUrl, max: 1 });
  // `alter table … rename` terminates nothing, but a pool with no listener
  // still crashes the process on any idle-client error.
  pool.on("error", () => undefined);
  const classes: FailureClassResult[] = [];

  try {
    for (const failureClass of WORKSPACE_FAILURE_CLASSES) {
      const sqlstate = INJECTED_SQLSTATE[failureClass];
      if (!sqlstate) continue;
      await removeFault(pool);
      await injectFault(pool, sqlstate);
      try {
        const startedAt = performance.now();
        const response = await fetch(
          new URL(CLASS_PROBE.path, options.baseUrl),
          {
            headers: options.cookie ? { cookie: options.cookie } : undefined,
            redirect: "manual",
            // A document request, which is what a hard load is.
            cache: "no-store",
          },
        );
        const html = await response.text();
        classes.push({
          ...evaluateSurface(
            CLASS_PROBE,
            html,
            response.status,
            Math.round(performance.now() - startedAt),
            failureClass,
          ),
          failureClass,
          sqlstate,
        });
      } finally {
        await removeFault(pool);
      }
    }
  } finally {
    await removeFault(pool).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }

  return {
    version: 1,
    issue: "OVE-457",
    baseUrl: options.baseUrl,
    classes,
    passedCount: classes.filter((entry) => entry.passed).length,
    failedCount: classes.filter((entry) => !entry.passed).length,
    generatedAt: new Date().toISOString(),
  };
}

export function renderFailureClassReceipt(receipt: FailureClassReceipt) {
  const rows = receipt.classes
    .map(
      (entry) =>
        `| \`${entry.failureClass}\` | \`${entry.sqlstate}\` | ${entry.status} | ${
          entry.headingPresent ? "yes" : "**no**"
        } | ${
          entry.failureClasses.includes(entry.failureClass) ? "yes" : "**no**"
        } | ${entry.strandedSkeleton ? "**stranded**" : "none"} | ${
          entry.boundaryCompletions
        } |`,
    )
    .join("\n");

  return `# Workspace failure classes, one injected fault each — ${receipt.generatedAt.slice(0, 10)}

Status: generated receipt. Regenerate with
\`pnpm prove:workspace-failure-classes\`. Issue: \`OVE-457\`. Decision:
\`docs/adr/ADR-0023-workspace-resilience.md\`.

## What was run

For each class, a real SQLSTATE was raised from a view standing in for
\`plant_objects\`, and \`/garden\` was fetched as a **document** — which is what
a hard load is, and the only shape the ADR-0023 defect reproduces in. Each
response had to answer 200, carry the surface's own heading, carry a
\`data-section-failure\` of that class, leave no Suspense boundary stranded and
error no boundary at all.

\`connection_unavailable\` is proved separately and across every surface by
\`pnpm prove:workspace-resilience\`, whose fault is a connection that is not
there — the honest injection for that class.

## Result

Passed ${receipt.passedCount} of ${receipt.classes.length} classes.

| Class | SQLSTATE | Status | Own heading | Class rendered | Stranded skeleton | Boundaries completed |
| -- | -- | -- | -- | -- | -- | -- |
${rows}

Generated against \`${receipt.baseUrl}\`.
`;
}

function readOption(flag: string) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const baseUrl = readOption("--base-url") ?? "http://127.0.0.1:3179";
  const cookieFile = readOption("--cookie-file");
  const databaseUrl = readOption("--database-url") ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const out =
    readOption("--out") ??
    path.join("..", "..", "docs", "WORKSPACE_FAILURE_CLASSES_PROOF.md");
  const cookie = cookieFile
    ? (await import("node:fs/promises"))
        .readFile(cookieFile, "utf8")
        .then((value) => value.trim())
    : "";

  const receipt = await proveWorkspaceFailureClasses({
    baseUrl,
    cookie: await cookie,
    databaseUrl,
  });
  await writeFile(out, renderFailureClassReceipt(receipt), "utf8");
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  if (receipt.failedCount > 0) process.exitCode = 1;
}

if (process.argv[1]?.includes("prove-workspace-failure-classes")) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
