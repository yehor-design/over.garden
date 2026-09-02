import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import { OPERATOR_MENU_LINKS } from "../src/lib/operator-menu-copy";
import {
  ABSENT_SCHEMA_SHAPE_DIGEST,
  APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
  APPROVED_ENVIRONMENT_BINDING_DIGEST,
  APPROVED_SCHEMA_SHAPE_DIGEST,
  RETIREMENT_LOCK_TIMEOUT_MS,
  buildRetirementPlan,
  isApprovedProductionDatabaseTarget,
  measureBoundedLockWait,
  observedActiveShapeDigest,
  parseOptions,
  readSnapshot,
  type RetirementSnapshot,
} from "./retire-obsolete-control-plane";

const webRoot = path.resolve(".");
const repositoryRoot = path.resolve(webRoot, "../..");
const implementationSha = "a".repeat(40);
const migrationDigest = "b".repeat(64);

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function toRepositoryRelativePath(filePath: string): string {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

const retiredRouteOwners = [
  "src/app/admin/layout.tsx",
  "src/app/admin/page.tsx",
  "src/app/admin/users/page.tsx",
  "src/app/admin/communities/page.tsx",
  "src/app/admin/communities/[slug]/page.tsx",
  "src/app/admin/communities/[slug]/actions.ts",
  "src/app/admin/moderation/comments/page.tsx",
  "src/app/admin/moderation/comments/actions.ts",
  "src/app/(default)/garden/pilot-health/page.tsx",
  "src/app/(default)/garden/pilot-smoke/page.tsx",
  "src/app/(default)/garden/pilot-learning/interviews/page.tsx",
  "src/app/(default)/garden/pilot-learning/decision/page.tsx",
  "src/app/join/page.tsx",
] as const;

const matchingSnapshot: RetirementSnapshot = {
  grantTableExists: true,
  outboxHintColumnsExist: true,
  inviteGrantCount: 43,
  closedPilotGrantCount: 6,
  founderRehearsalGrantCount: 37,
  outboxCount: 0,
  hintedOutboxCount: 0,
  unfinishedHintedOutboxCount: 0,
  incomingForeignKeyCount: 0,
  viewDependencyCount: 0,
  schemaShapeDigest: APPROVED_SCHEMA_SHAPE_DIGEST,
  retiredAttributionCount: 0,
  orphanGrantCount: 0,
  protectedCounts: {
    authUsers: 10,
    journalEntries: 20,
    plantObjects: 15,
    mediaAssets: 7,
  },
};

const completedSnapshot: RetirementSnapshot = {
  ...matchingSnapshot,
  grantTableExists: false,
  outboxHintColumnsExist: false,
  inviteGrantCount: 0,
  closedPilotGrantCount: 0,
  founderRehearsalGrantCount: 0,
  outboxCount: 2,
  schemaShapeDigest: ABSENT_SCHEMA_SHAPE_DIGEST,
};

const productionUpgradeGrantColumns = [
  {
    column_name: "user_id",
    formatted_type: "uuid",
    not_null: true,
    default_expression: null,
  },
  {
    column_name: "cohort",
    formatted_type: "text",
    not_null: true,
    default_expression: "'closed_pilot'::text",
  },
  {
    column_name: "granted_at",
    formatted_type: "timestamp with time zone",
    not_null: true,
    default_expression: "now()",
  },
  {
    column_name: "created_at",
    formatted_type: "timestamp with time zone",
    not_null: true,
    default_expression: "now()",
  },
  {
    column_name: "updated_at",
    formatted_type: "timestamp with time zone",
    not_null: true,
    default_expression: "now()",
  },
  {
    column_name: "segment",
    formatted_type: "text",
    not_null: true,
    default_expression: "'unknown_segment'::text",
  },
] as const;

const productionUpgradeHintColumns = [
  {
    column_name: "cohort",
    formatted_type: "text",
    not_null: false,
    default_expression: null,
  },
  {
    column_name: "segment",
    formatted_type: "text",
    not_null: false,
    default_expression: null,
  },
] as const;

function buildInput(
  snapshot: RetirementSnapshot = matchingSnapshot,
  overrides: Record<string, unknown> = {},
) {
  return {
    environment: "production" as const,
    implementationSha,
    migrationDigest,
    authorizationReceiptDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
    environmentBindingDigest: APPROVED_ENVIRONMENT_BINDING_DIGEST,
    routeAbsenceClass: "exact_404" as const,
    menuContractClass: "sealed_owner_exact_four" as const,
    vercelEnvTargetClass: "present_all" as const,
    implementationContained: true,
    vercelReadySha: implementationSha,
    snapshot,
    ...overrides,
  };
}

describe("OVE-314 aggregate-only retirement plan", () => {
  it("accepts the exact upgrade schema independently of physical column order", () => {
    expect(
      observedActiveShapeDigest(
        [...productionUpgradeGrantColumns],
        9,
        [...productionUpgradeHintColumns].reverse(),
      ),
    ).toBe(APPROVED_SCHEMA_SHAPE_DIGEST);
  });

  it("still rejects name, type, default, duplicate, hint, and constraint drift", () => {
    const exactGrantColumns = [...productionUpgradeGrantColumns];
    const exactHintColumns = [...productionUpgradeHintColumns];
    const changedDefault = exactGrantColumns.map((column) =>
      column.column_name === "segment"
        ? { ...column, default_expression: "'closed_pilot'::text" }
        : column,
    );
    const duplicateName = exactGrantColumns.map((column) =>
      column.column_name === "segment"
        ? { ...column, column_name: "cohort" }
        : column,
    );
    const changedHintType = exactHintColumns.map((column) =>
      column.column_name === "segment"
        ? { ...column, formatted_type: "varchar" }
        : column,
    );

    for (const digest of [
      observedActiveShapeDigest(changedDefault, 9, exactHintColumns),
      observedActiveShapeDigest(duplicateName, 9, exactHintColumns),
      observedActiveShapeDigest(
        exactGrantColumns.slice(1),
        9,
        exactHintColumns,
      ),
      observedActiveShapeDigest(exactGrantColumns, 9, changedHintType),
      observedActiveShapeDigest(exactGrantColumns, 8, exactHintColumns),
    ]) {
      expect(digest).not.toBe(APPROVED_SCHEMA_SHAPE_DIGEST);
    }
  });

  it("classifies only the exact approved production snapshot as code deployed", () => {
    const plan = buildRetirementPlan(buildInput());

    expect(plan).toMatchObject({
      version: 1,
      environment: "production",
      implementationSha,
      inviteGrantCount: 43,
      closedPilotGrantCount: 6,
      founderRehearsalGrantCount: 37,
      outboxCount: 0,
      hintedOutboxCount: 0,
      unfinishedHintedOutboxCount: 0,
      incomingForeignKeyCount: 0,
      viewDependencyCount: 0,
      schemaShapeDigest: APPROVED_SCHEMA_SHAPE_DIGEST,
      routeAbsenceClass: "exact_404",
      menuContractClass: "sealed_owner_exact_four",
      vercelEnvTargetClass: "present_all",
      state: "code_deployed",
    });
    expect(Object.keys(plan).sort()).toEqual(
      [
        "version",
        "environment",
        "implementationSha",
        "migrationDigest",
        "authorizationReceiptDigest",
        "environmentBindingDigest",
        "inviteGrantCount",
        "closedPilotGrantCount",
        "founderRehearsalGrantCount",
        "outboxCount",
        "hintedOutboxCount",
        "unfinishedHintedOutboxCount",
        "incomingForeignKeyCount",
        "viewDependencyCount",
        "schemaShapeDigest",
        "routeAbsenceClass",
        "menuContractClass",
        "vercelEnvTargetClass",
        "state",
        "evidenceDigest",
      ].sort(),
    );
    expect(plan.evidenceDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accepts pre-existing partial provider absence before bounded cleanup", () => {
    const plan = buildRetirementPlan(
      buildInput(matchingSnapshot, { vercelEnvTargetClass: "mixed" }),
    );

    expect(plan).toMatchObject({
      vercelEnvTargetClass: "mixed",
      state: "code_deployed",
    });
  });

  it.each([
    ["grant total", { inviteGrantCount: 44 }],
    ["closed cohort", { closedPilotGrantCount: 5 }],
    ["founder cohort", { founderRehearsalGrantCount: 38 }],
    ["outbox work", { outboxCount: 1 }],
    ["hinted work", { hintedOutboxCount: 1 }],
    ["unfinished hint", { unfinishedHintedOutboxCount: 1 }],
    ["incoming foreign key", { incomingForeignKeyCount: 1 }],
    ["view dependency", { viewDependencyCount: 1 }],
    ["schema shape", { schemaShapeDigest: "c".repeat(64) }],
    ["orphan grant", { orphanGrantCount: 1 }],
  ])("fails closed before mutation on %s drift", (_label, drift) => {
    expect(
      buildRetirementPlan(buildInput({ ...matchingSnapshot, ...drift })).state,
    ).toBe("failed");
  });

  it.each([
    ["authorization", { authorizationReceiptDigest: "c".repeat(64) }],
    ["environment", { environmentBindingDigest: "c".repeat(64) }],
    ["route", { routeAbsenceClass: "unproved" }],
    ["menu", { menuContractClass: "unproved" }],
    ["containment", { implementationContained: false }],
    ["READY SHA", { vercelReadySha: "c".repeat(40) }],
    ["Vercel targets", { vercelEnvTargetClass: "unproved" }],
  ])("fails closed on %s proof drift", (_label, drift) => {
    expect(buildRetirementPlan(buildInput(matchingSnapshot, drift)).state).toBe(
      "failed",
    );
  });

  it("distinguishes database completion from complete provider cleanup", () => {
    expect(buildRetirementPlan(buildInput(completedSnapshot)).state).toBe(
      "database_completed",
    );
    expect(
      buildRetirementPlan(
        buildInput(completedSnapshot, { vercelEnvTargetClass: "mixed" }),
      ).state,
    ).toBe("database_completed");
    expect(
      buildRetirementPlan(
        buildInput(completedSnapshot, {
          vercelEnvTargetClass: "absent_all",
        }),
      ).state,
    ).toBe("already_completed");
  });

  it("allows new self-serve outbox work after hint columns are retired", () => {
    const plan = buildRetirementPlan(
      buildInput(
        { ...completedSnapshot, outboxCount: 12 },
        {
          vercelEnvTargetClass: "absent_all",
        },
      ),
    );
    expect(plan.state).toBe("already_completed");
    expect(plan.outboxCount).toBe(12);
  });

  it("emits a deterministic receipt without private or credential payload", () => {
    const first = buildRetirementPlan(buildInput());
    const second = buildRetirementPlan(buildInput());
    expect(first).toEqual(second);
    const serialized = JSON.stringify(first);
    for (const forbidden of [
      "email",
      "password",
      "cookie",
      "userId",
      "sessionId",
      "connectionString",
      "latitude",
      "longitude",
      "unknown_segment",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("OVE-314 bounded command and target binding", () => {
  it("accepts only the exact production plan command", () => {
    expect(
      parseOptions([
        "--",
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        implementationSha,
        "--plan",
      ]),
    ).toEqual({
      mode: "plan",
      environment: "production",
      implementationSha,
      approvalDigest: undefined,
    });
  });

  it("requires the byte-exact authorization digest for apply", () => {
    expect(
      parseOptions([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        implementationSha,
        "--apply",
        "--approval-digest",
        APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
      ]),
    ).toMatchObject({
      mode: "apply",
      approvalDigest: APPROVED_AUTHORIZATION_RECEIPT_DIGEST,
    });
    expect(() =>
      parseOptions([
        "--environment",
        "production",
        "--confirm-environment",
        "production",
        "--implementation-sha",
        implementationSha,
        "--apply",
        "--approval-digest",
        "c".repeat(64),
      ]),
    ).toThrow("invalid_input");
  });

  it.each([
    ["missing confirmation", ["--confirm-environment", "production"]],
    ["duplicate mode", ["--apply"]],
    ["unknown option", ["--unknown", "value"]],
    [
      "plan approval",
      ["--approval-digest", APPROVED_AUTHORIZATION_RECEIPT_DIGEST],
    ],
  ])("rejects %s", (_label, extraOrRemoval) => {
    const base = [
      "--environment",
      "production",
      "--confirm-environment",
      "production",
      "--implementation-sha",
      implementationSha,
      "--plan",
    ];
    const args =
      _label === "missing confirmation"
        ? base.filter((_value, index) => index !== 2 && index !== 3)
        : [...base, ...extraOrRemoval];
    expect(() => parseOptions(args)).toThrow("invalid_input");
  });

  it("binds execution to the approved DigitalOcean production database", () => {
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/defaultdb?sslmode=require",
      ),
    ).toBe(true);
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@127.0.0.1:5432/defaultdb",
      ),
    ).toBe(false);
    expect(
      isApprovedProductionDatabaseTarget(
        "postgresql://redacted:redacted@overgarden-postgres-prod-fra1-do-user-39359942-0.j.db.ondigitalocean.com:25060/other",
      ),
    ).toBe(false);
  });

  it("measures a real monotonic timeout below the five-second lock budget", async () => {
    const result = await measureBoundedLockWait(
      () => new Promise<void>(() => undefined),
      25,
    );
    expect(result.state).toBe("failed");
    expect(result.durationMs).toBeGreaterThanOrEqual(20);
    expect(result.durationMs).toBeLessThan(RETIREMENT_LOCK_TIMEOUT_MS);

    const shellSource = await readFile(
      path.join(webRoot, "src/components/site-shell/site-shell.tsx"),
      "utf8",
    );
    expect(shellSource).toContain("<SignOutControl");
    expect(shellSource).toContain('href="/garden/profile"');
  });
});

describe("OVE-314 active caller and schema retirement", () => {
  it("removes every retired page owner while preserving lineage invitations", async () => {
    await Promise.all(
      retiredRouteOwners.map(async (relativePath) => {
        await expect(
          access(path.join(webRoot, relativePath)),
        ).rejects.toThrow();
      }),
    );
    await expect(
      access(
        path.join(
          webRoot,
          "src/app/(default)/garden/lineage/invitations/claim/page.tsx",
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("keeps the owner avatar menu field-exact and excludes retired destinations", () => {
    expect(OPERATOR_MENU_LINKS.map(({ href }) => href)).toEqual([
      "/account/communities",
      "/account/moderation/comments",
      "/garden/catalog/curation",
      "/garden/privacy/erasure-requests",
    ]);
    expect(JSON.stringify(OPERATOR_MENU_LINKS)).not.toMatch(
      /\/admin(?:"|\/users)|pilot|\/join/,
    );
  });

  it("keeps fresh bootstrap invite-free and the upgrade migration bounded", async () => {
    const [bootstrapSql, migrationSql] = await Promise.all([
      readFile(path.join(webRoot, "sql/0001_walking_skeleton.sql"), "utf8"),
      readFile(
        path.join(webRoot, "sql/0021_ove314_retire_obsolete_control_plane.sql"),
        "utf8",
      ),
    ]);
    expect(bootstrapSql).not.toContain(
      "create table if not exists pilot_invite_grants",
    );
    expect(bootstrapSql).not.toMatch(/\bcohort text\b|\bsegment text\b/);
    expect(migrationSql).toContain(
      "drop table if exists public.pilot_invite_grants",
    );
    expect(migrationSql).toContain("drop column if exists cohort");
    expect(migrationSql).toContain("drop column if exists segment");
    expect(migrationSql).not.toMatch(
      /delete from\s+"?user"?|delete from\s+journal_entries/i,
    );
  });

  it("locks and re-snapshots before the approved destructive migration", async () => {
    const source = await readFile(
      path.join(webRoot, "scripts/retire-obsolete-control-plane.ts"),
      "utf8",
    );
    const advisoryIndex = source.indexOf("pg_advisory_xact_lock");
    const tableLockIndex = source.indexOf(
      "lock table public.pilot_invite_grants in access exclusive mode",
      advisoryIndex,
    );
    const snapshotIndex = source.indexOf(
      "const before = await readSnapshot(client)",
      tableLockIndex,
    );
    const migrationIndex = source.indexOf(
      "await client.query({ text: migration.sql })",
      snapshotIndex,
    );
    expect(advisoryIndex).toBeGreaterThan(-1);
    expect(tableLockIndex).toBeGreaterThan(advisoryIndex);
    expect(snapshotIndex).toBeGreaterThan(tableLockIndex);
    expect(migrationIndex).toBeGreaterThan(snapshotIndex);
  });

  it("leaves no live product-access invite or retired control-plane caller", async () => {
    const pattern =
      /pilot_invite_grants|PILOT_INVITE_SIGNING_SECRET|pilot-write-access|pilot-invite|closed-pilot-write-callout|\/garden\/pilot-(health|smoke)|\/admin\/users|href=["']?\/admin["']|\/join(?:["'/?]|$)/;
    const sourceFiles = [
      ...(await collectFiles(path.join(webRoot, "src"))),
      ...(await collectFiles(path.join(webRoot, "scripts"))),
      ...(await collectFiles(path.join(webRoot, "test"))),
      path.join(webRoot, ".env.example"),
      path.join(repositoryRoot, "infra/run-with-local-infra-env"),
    ].sort();
    const matches: string[] = [];

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf8");
      for (const [lineIndex, line] of source.split(/\r?\n/).entries()) {
        if (pattern.test(line)) {
          matches.push(
            `${toRepositoryRelativePath(filePath)}:${lineIndex + 1}:${line}`,
          );
        }
      }
    }

    const allowed = [
      "apps/web/scripts/retire-obsolete-control-plane.ts:",
      "apps/web/scripts/retire-obsolete-control-plane.test.ts:",
      "apps/web/scripts/smoke-admin-role.ts:",
      "apps/web/scripts/smoke-self-serve-mvp.ts:",
      "apps/web/src/lib/retired-control-plane-routes.ts:",
    ];
    const unexpected = matches.filter(
      (line) =>
        !line.includes(".test.ts:") &&
        !line.includes(".test.tsx:") &&
        !allowed.some((prefix) => line.startsWith(prefix)),
    );
    expect(unexpected).toEqual([]);
  });
});

const runDatabaseIntegration = process.env.OVE314_RUN_DB_INTEGRATION === "1";

describe("OVE-314 real PostgreSQL migration", () => {
  it.runIf(runDatabaseIntegration)(
    "reclassifies fixtures, preserves protected totals, drops only approved storage, and replays",
    async () => {
      const resolution = resolveDatabaseConnection();
      const connectionString = resolvePgConnectionString(
        process.env,
        resolution,
      );
      if (
        !connectionString ||
        !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(connectionString)
      ) {
        throw new Error(
          "OVE314 integration requires an explicitly local database",
        );
      }
      const migrationSql = await readFile(
        path.join(webRoot, "sql/0021_ove314_retire_obsolete_control_plane.sql"),
        "utf8",
      );
      const pool = new Pool({
        connectionString,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
        max: 1,
      });
      const client = await pool.connect();
      const closedUser = "31400000-0000-4000-8000-000000000001";
      const founderUser = "31400000-0000-4000-8000-000000000002";
      const missingAttributionUser = "31400000-0000-4000-8000-000000000003";
      try {
        await client.query("begin");
        const protectedBefore = await client.query({
          text: `
            select
              (select count(*) from "user") as users,
              (select count(*) from journal_entries) as journals,
              (select count(*) from plant_objects) as objects,
              (select count(*) from media_assets) as media
          `,
        });
        await client.query(`
          alter table learning_actor_attributions
            drop constraint if exists learning_actor_attributions_user_id_fkey,
            drop constraint if exists learning_actor_attributions_actor_class_check,
            drop constraint if exists learning_actor_attributions_source_check;
          alter table learning_actor_attributions
            add constraint learning_actor_attributions_actor_class_check
              check (actor_class in (
                'real_self_serve', 'real_closed_pilot', 'founder_rehearsal',
                'production_smoke', 'visual_fixture', 'editorial_seed', 'automated_bot'
              )),
            add constraint learning_actor_attributions_source_check
              check (source in ('producer', 'operator_plan', 'self_serve_default', 'pilot_grant'));

          alter table learning_attribution_outbox
            add column cohort text,
            add column segment text,
            drop constraint if exists learning_attribution_outbox_error_class_check;
          alter table learning_attribution_outbox
            add constraint learning_attribution_outbox_hint_pair_check
              check ((cohort is null and segment is null) or cohort is not null),
            add constraint learning_attribution_outbox_error_class_check
              check (last_error_class is null or last_error_class in (
                'transient', 'invalid_hint', 'missing_user', 'max_attempts'
              ));

          create table public.pilot_invite_grants (
            user_id uuid primary key,
            cohort text not null default 'closed_pilot'
              check (cohort in ('closed_pilot', 'founder_rehearsal')),
            segment text not null default 'unknown_segment',
            granted_at timestamptz not null default now(),
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          );

          insert into learning_actor_attributions (user_id, actor_class, source)
          values
            ('${closedUser}', 'real_closed_pilot', 'pilot_grant'),
            ('${founderUser}', 'founder_rehearsal', 'pilot_grant');
          insert into public.pilot_invite_grants (user_id, cohort)
          values
            ('${closedUser}', 'closed_pilot'),
            ('${founderUser}', 'founder_rehearsal'),
            ('${missingAttributionUser}', 'closed_pilot');
          insert into analytics_events (owner_user_id, event_name, properties)
          values
            ('${closedUser}', 'activation_started', '{"actor_class":"closed_pilot","activation_source":"invited_cohort","source_surface_kind":"invite"}'::jsonb),
            ('${founderUser}', 'activation_started', '{"actor_class":"founder_rehearsal"}'::jsonb);
        `);

        await client.query(migrationSql);
        const attribution = await client.query<{
          user_id: string;
          actor_class: string;
          source: string;
        }>({
          text: `
            select user_id::text, actor_class, source
            from learning_actor_attributions
            where user_id = any($1::uuid[])
            order by user_id
          `,
          values: [[closedUser, founderUser, missingAttributionUser]],
        });
        expect(attribution.rows).toEqual([
          {
            user_id: closedUser,
            actor_class: "real_self_serve",
            source: "self_serve_default",
          },
          {
            user_id: founderUser,
            actor_class: "production_smoke",
            source: "operator_plan",
          },
        ]);
        const absence = await client.query<{
          grant_table_absent: boolean;
          hint_columns_absent: boolean;
          retired_values: string;
        }>({
          text: `
            select
              to_regclass('public.pilot_invite_grants') is null as grant_table_absent,
              not exists (
                select 1 from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'learning_attribution_outbox'
                  and column_name in ('cohort', 'segment')
              ) as hint_columns_absent,
              (
                select count(*)::text from learning_actor_attributions
                where actor_class in ('real_closed_pilot', 'founder_rehearsal')
                   or source = 'pilot_grant'
              ) as retired_values
          `,
        });
        expect(absence.rows[0]).toEqual({
          grant_table_absent: true,
          hint_columns_absent: true,
          retired_values: "0",
        });
        const analytics = await client.query<{
          actor_class: string;
          activation_source: string | null;
          source_surface_kind: string | null;
        }>({
          text: `
            select
              properties ->> 'actor_class' as actor_class,
              properties ->> 'activation_source' as activation_source,
              properties ->> 'source_surface_kind' as source_surface_kind
            from analytics_events
            where owner_user_id = any($1::uuid[])
            order by owner_user_id
          `,
          values: [[closedUser, founderUser]],
        });
        expect(analytics.rows).toEqual([
          {
            actor_class: "real_self_serve",
            activation_source: "direct_garden",
            source_surface_kind: "garden",
          },
          {
            actor_class: "production_smoke",
            activation_source: null,
            source_surface_kind: null,
          },
        ]);

        const protectedAfter = await client.query({
          text: `
            select
              (select count(*) from "user") as users,
              (select count(*) from journal_entries) as journals,
              (select count(*) from plant_objects) as objects,
              (select count(*) from media_assets) as media
          `,
        });
        expect(protectedAfter.rows).toEqual(protectedBefore.rows);

        const postMigrationSnapshot = await readSnapshot(client);
        expect(postMigrationSnapshot).toMatchObject({
          grantTableExists: false,
          outboxHintColumnsExist: false,
          schemaShapeDigest: ABSENT_SCHEMA_SHAPE_DIGEST,
          retiredAttributionCount: 0,
          orphanGrantCount: 0,
        });

        await expect(client.query(migrationSql)).resolves.toBeDefined();
      } finally {
        await client.query("rollback").catch(() => undefined);
        client.release();
        await pool.end();
      }
    },
    30_000,
  );
});
