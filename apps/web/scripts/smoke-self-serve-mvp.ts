/**
 * OVE-193 local self-serve first-journal smoke.
 * Proves self-serve signup → first private entry → follow-up → actor attribution
 * without printing emails, handles, UUIDs, draft bodies, or media keys.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";

import {
  resolveDatabaseConnection,
  resolveDatabaseSslConfig,
  resolvePgConnectionString,
} from "../src/db/connection";
import type { Database } from "../src/db/types";
import {
  ACTOR_CLASSES,
  SELF_SERVE_ACTOR_CLASS,
} from "../src/lib/garden/actor-class";
import {
  JOURNAL_DOCUMENT_SCHEMA_VERSION,
  MAX_JOURNAL_INLINE_IMAGES,
  normalizeJournalDocument,
} from "../src/lib/garden/journal-document";
import {
  JOURNAL_MEDIA_USAGE_COVER_ONLY,
  JOURNAL_MEDIA_USAGE_INLINE,
  resolveEffectiveJournalCover,
} from "../src/lib/garden/journal-cover-contract";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = require(path.join(root, "..", "package.json")) as {
  scripts?: Record<string, string>;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";
const SYNTHETIC_EMAIL_PREFIX = "ove193-self-serve-";
const SYNTHETIC_EMAIL_SUFFIX = "@over.garden";
const EVIDENCE_SAFETY =
  "bounded_counts_and_booleans_no_identifiers_or_private_content";
const SIGN_UP_PATH = "/api/auth/sign-up/email";
const ENTRIES_PATH = "/api/garden/entries";

type DB = Kysely<Database>;

class CookieJar {
  private readonly values = new Map<string, string>();

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";", 1)[0] ?? "";
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function readFlagValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function isLoopbackHost(hostname: string) {
  return new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]).has(
    hostname.toLowerCase(),
  );
}

function isLoopbackDatabase(connectionString: string) {
  try {
    return isLoopbackHost(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

function getSetCookieHeaders(headers: Headers): string[] {
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function assertLocalGate() {
  const environment = readFlagValue("--environment");
  const confirm = readFlagValue("--confirm-environment");
  assert(
    environment === "local" && confirm === "local",
    "Requires --environment local --confirm-environment local",
  );
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  assert(
    databaseUrl && isLoopbackDatabase(databaseUrl),
    "Refuses non-loopback DATABASE_URL",
  );
  const baseUrl = readFlagValue("--base-url") ?? DEFAULT_BASE_URL;
  assert(
    isLoopbackHost(new URL(baseUrl).hostname),
    "Refuses non-loopback base URL",
  );
  return baseUrl;
}

function openDatabase(): DB {
  const resolution = resolveDatabaseConnection(process.env);
  const connectionString = resolvePgConnectionString(process.env, resolution);
  assert(connectionString, "DATABASE_URL required");
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        max: 2,
        ssl: resolveDatabaseSslConfig(process.env, resolution),
      }),
    }),
  });
}

async function main() {
  loadEnv({ path: ".env.local", override: false });
  // Prefer already-exported loopback DATABASE_URL from
  // infra/run-with-local-infra-env; never silently promote .env.local remote.
  const baseUrl = assertLocalGate();

  assert(
    pkg.scripts?.["smoke:self-serve-mvp"]?.includes("smoke-self-serve-mvp.ts"),
    "package.json must expose smoke:self-serve-mvp",
  );
  assert(ACTOR_CLASSES.includes(SELF_SERVE_ACTOR_CLASS), "actor class set");

  const tenInline = Array.from(
    { length: MAX_JOURNAL_INLINE_IMAGES },
    (_, index) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  );
  const document = normalizeJournalDocument({
    schemaVersion: JOURNAL_DOCUMENT_SCHEMA_VERSION,
    blocks: [
      { id: "p1", type: "paragraph", spans: [{ text: "note", marks: [] }] },
      ...tenInline.map((mediaAssetId, index) => ({
        id: `img-${index + 1}`,
        type: "image" as const,
        mediaAssetId,
      })),
    ],
  });
  assert(document.ok, "10-inline document must normalize");
  const candidatesById = new Map(
    tenInline.map((id) => [
      id,
      {
        mediaAssetId: id,
        usageRole: JOURNAL_MEDIA_USAGE_INLINE,
        status: "processed" as const,
        derivativeKey: `${id}.webp`,
        originalDeletedAt: new Date(),
      },
    ]),
  );
  const cover = resolveEffectiveJournalCover({
    document: document.document,
    explicitCoverMediaAssetId: null,
    candidatesById,
  });
  assertEqual(cover.mediaAssetId, tenInline[0], "automatic first-inline cover");
  assertEqual(
    JOURNAL_MEDIA_USAGE_COVER_ONLY,
    "cover_only",
    "cover-only role contract",
  );

  const database = openDatabase();
  const jar = new CookieJar();
  const email = `${SYNTHETIC_EMAIL_PREFIX}${randomUUID().slice(0, 8)}${SYNTHETIC_EMAIL_SUFFIX}`;
  const password = `Ove193!${randomUUID().slice(0, 12)}`;
  let userId: string | undefined;

  try {
    const signup = await fetch(new URL(SIGN_UP_PATH, baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({
        email,
        password,
        name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      }),
    });
    jar.addFromResponse(signup);
    assert(signup.ok, `signup failed with status ${signup.status}`);

    const sessionPayload = (await signup.json()) as {
      user?: { id?: string };
    };
    userId = sessionPayload.user?.id;
    assert(typeof userId === "string" && userId.length > 0, "signup user id");

    await database
      .updateTable("user")
      .set({ emailVerified: true, updatedAt: new Date() })
      .where("id", "=", userId)
      .execute();

    // Prefer a fresh verified session after operator-style verification.
    const signIn = await fetch(new URL("/api/auth/sign-in/email", baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({ email, password }),
    });
    jar.addFromResponse(signIn);
    assert(signIn.ok, `sign-in failed with status ${signIn.status}`);

    const sessionCheck = await fetch(
      new URL("/api/auth/get-session?disableCookieCache=true", baseUrl),
      { headers: { cookie: jar.header() } },
    );
    jar.addFromResponse(sessionCheck);
    assert(
      sessionCheck.ok,
      `get-session failed with status ${sessionCheck.status}`,
    );
    const sessionBody = (await sessionCheck.json()) as {
      user?: { id?: string };
    };
    assertEqual(
      sessionBody.user?.id,
      userId,
      "session continuity after verify",
    );

    const gardenHtml = await fetch(new URL("/garden", baseUrl), {
      headers: { cookie: jar.header() },
    }).then(async (response) => {
      jar.addFromResponse(response);
      assert(response.ok, `garden status ${response.status}`);
      return response.text();
    });
    assert(
      !gardenHtml.includes("closed-pilot-write-callout"),
      "authenticated garden must not show invite write gate",
    );
    assert(
      !/лише за запрошенням|само с покана|только по приглашению/i.test(
        gardenHtml,
      ),
      "authenticated garden must not claim invite-only writing",
    );

    const firstMutationId = randomUUID();
    const firstResponse = await fetch(new URL(ENTRIES_PATH, baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: jar.header(),
        origin: baseUrl,
      },
      body: JSON.stringify({
        target: "first_plant_entry",
        spaceName: "OVE-193 synthetic space",
        plantName: "OVE-193 synthetic object",
        objectKind: "plant",
        catalogItemId: null,
        userAddedCatalogName: "OVE-193 synthetic plant",
        varietyText: null,
        title: "OVE-193 first note",
        body: "Private self-serve first journal note.",
        entryDate: "2026-07-23",
        locationVisibility: "hidden",
        coarseRegionCode: null,
        clientMutationId: firstMutationId,
        syncStatus: "online",
        activationSource: "direct_garden",
      }),
    });
    jar.addFromResponse(firstResponse);
    assert(
      firstResponse.ok,
      `first entry failed with status ${firstResponse.status}`,
    );
    const firstBody = (await firstResponse.json()) as {
      entry?: { id?: string };
      plantObject?: { id?: string };
    };
    const entryId = firstBody.entry?.id;
    const plantObjectId = firstBody.plantObject?.id;
    assert(typeof entryId === "string", "first entry id");
    assert(typeof plantObjectId === "string", "plant object id");

    const entryRow = await database
      .selectFrom("journal_entries")
      .select(["visibility", "owner_user_id"])
      .where("id", "=", entryId)
      .executeTakeFirstOrThrow();
    assertEqual(
      entryRow.visibility,
      "private",
      "first entry private by default",
    );
    assertEqual(entryRow.owner_user_id, userId, "owner continuity");

    const actorClassRow = await database
      .selectFrom("analytics_events")
      .select(sql<string>`properties ->> 'actor_class'`.as("actorClass"))
      .where("owner_user_id", "=", userId)
      .where("event_name", "=", "entry_logged")
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    assertEqual(
      actorClassRow?.actorClass,
      SELF_SERVE_ACTOR_CLASS,
      "entry_logged actor_class",
    );

    const followUp = await fetch(new URL(ENTRIES_PATH, baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: jar.header(),
        origin: baseUrl,
      },
      body: JSON.stringify({
        target: "plant_object_entry",
        plantObjectId,
        title: "OVE-193 follow-up",
        body: "Second dated self-serve note.",
        entryDate: "2026-07-24",
        clientMutationId: randomUUID(),
        syncStatus: "online",
      }),
    });
    jar.addFromResponse(followUp);
    assert(followUp.ok, `follow-up failed with status ${followUp.status}`);

    const entryCount = await database
      .selectFrom("journal_entries")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("owner_user_id", "=", userId)
      .executeTakeFirstOrThrow();
    assertEqual(Number(entryCount.count), 2, "first + follow-up entries");

    const spaces = await database
      .selectFrom("spaces")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("owner_user_id", "=", userId)
      .executeTakeFirstOrThrow();
    assertEqual(Number(spaces.count), 1, "single garden space");

    console.log(
      JSON.stringify(
        {
          ok: true,
          issue: "OVE-193",
          evidenceClass: "synthetic_local_self_serve_first_journal",
          runtimeClass: "local",
          accessMode: "self_serve",
          firstEntryVisibility: "private",
          entryCount: 2,
          actorClass: SELF_SERVE_ACTOR_CLASS,
          retiredAccessGateAbsent: true,
          composerContracts: {
            maxInlineImages: MAX_JOURNAL_INLINE_IMAGES,
            automaticFirstInlineCover: true,
            coverOnlyRole: JOURNAL_MEDIA_USAGE_COVER_ONLY,
          },
          evidenceSafety: EVIDENCE_SAFETY,
        },
        null,
        2,
      ),
    );
  } finally {
    const cleanupUserId = userId;
    if (cleanupUserId) {
      await database.transaction().execute(async (trx) => {
        await trx
          .deleteFrom("verification")
          .where("identifier", "=", email)
          .execute();
        await trx
          .deleteFrom("analytics_events")
          .where("owner_user_id", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("journal_entries")
          .where("owner_user_id", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("plant_objects")
          .where("owner_user_id", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("spaces")
          .where("owner_user_id", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("session")
          .where("userId", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("account")
          .where("userId", "=", cleanupUserId)
          .execute();
        await trx
          .deleteFrom("user")
          .where("id", "=", cleanupUserId)
          .where("email", "=", email)
          .execute();
      });
    }
    await database.destroy();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      issue: "OVE-193",
      error: "self_serve_mvp_smoke_failed",
      evidenceSafety: EVIDENCE_SAFETY,
      message: error instanceof Error ? error.message : "unknown",
    }),
  );
  process.exitCode = 1;
});
