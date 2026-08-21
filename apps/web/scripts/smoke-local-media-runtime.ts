import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnv } from "dotenv";
import type { Kysely } from "kysely";
import { Meilisearch } from "meilisearch";
import sharp from "sharp";

import type { Database } from "../src/db/schema";
import { PRIVATE_AUTH_COMPATIBILITY_NAME } from "../src/lib/auth/public-identity-compatibility";
import {
  ONLINE_JOURNAL_PROTOCOL,
  ONLINE_JOURNAL_PROTOCOL_HEADER,
} from "../src/lib/garden/entry-contracts";
import { assertLoopbackLocalRuntimeEnvironment } from "../src/lib/local-runtime-safety";
import { VISUAL_FIXTURE_MANIFEST } from "../src/lib/visual-fixtures/manifest";

type Phase = "seed" | "verify" | "cleanup";
type DB = Kysely<Database>;

interface UploadResponse {
  mediaAssetId: string;
  uploadUrl: string;
}

interface ProcessResponse {
  mediaAsset?: { status?: string };
  publicUrl?: string;
}

interface EntryResponse {
  space: { id: string };
  plantObject: { id: string };
  entry: { id: string };
  readbackUrl: string;
}

interface RuntimeState {
  version: 1;
  userId: string;
  email: string;
  password: string;
  mediaAssetId: string;
  entryId: string;
  plantObjectId: string;
  spaceId: string;
  quarantineKey: string;
  derivativeKey: string;
  publicUrl: string;
  ownerReadbackUrl: string;
  publicReadbackPath: string;
  meiliIndexUid: typeof MEILI_INDEX_UID;
  meiliDocumentId: string;
  fixtureDerivativeKey: string;
}

const STATE_FILE = fileURLToPath(
  new URL("../.runtime/ove189-media-proof.json", import.meta.url),
);
const STATE_DIRECTORY = fileURLToPath(new URL("../.runtime/", import.meta.url));
const BASE_URL = "http://127.0.0.1:3000";
const EMAIL_PREFIX = "ove189-media-runtime-";
const EMAIL_SUFFIX = "@example.invalid";
const MEILI_INDEX_UID = "ove189_runtime_proof";
const PROOF_TITLE = "OVE-189 local media runtime proof";
const PROOF_BODY = "Synthetic local-only photo persistence proof.";
const PROOF_ENTRY_DATE = "2026-07-17";

let currentStep = "startup";
let db: DB | undefined;

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFromResponse(response: Response) {
    for (const cookie of getSetCookieHeaders(response.headers)) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  header() {
    return [...this.cookies.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function main() {
  const phase = parsePhase(process.argv.slice(2));
  loadEnv({ path: ".env.local", override: false });
  currentStep = "loopback-safety-gate";
  assertLoopbackLocalRuntimeEnvironment(process.env);
  assertEqual(
    new URL(BASE_URL).origin,
    requiredOrigin("PUBLIC_SITE_URL"),
    "app origin",
  );

  currentStep = "runtime-module-load";
  ({ db } = await import("../src/db"));

  if (phase === "seed") await seedProof();
  if (phase === "verify") await verifyProof();
  if (phase === "cleanup") await cleanupProof();
}

async function seedProof() {
  currentStep = "seed-state-precondition";
  await assertStateAbsent();
  const store = createObjectStoreClient();
  const search = createMeiliClient();
  const jar = new CookieJar();
  const email = `${EMAIL_PREFIX}${Date.now()}-${randomUUID()}${EMAIL_SUFFIX}`;
  const password = `ove189-${randomUUID()}-${Date.now()}`;
  let userId: string | undefined;
  let mediaAssetId: string | undefined;
  let quarantineKey: string | undefined;
  let derivativeKey: string | undefined;

  try {
    currentStep = "seed-stale-proof-cleanup";
    await cleanupStaleSyntheticProofs(store, search);

    currentStep = "seed-fixture-canary-read";
    const fixtureDerivativeKey =
      VISUAL_FIXTURE_MANIFEST.media[0]?.derivativeKey;
    assert(fixtureDerivativeKey, "fixture canary is configured");
    assert(
      await objectExists(
        store,
        requiredEnv("R2_PUBLIC_BUCKET"),
        fixtureDerivativeKey,
      ),
      "fixture canary exists before media proof",
    );

    currentStep = "seed-auth-account";
    userId = await createLocalProofAccount(email, password, jar);

    currentStep = "seed-source-image";
    const original = await createMetadataBearingJpeg();
    const originalMetadata = await sharp(original).metadata();
    assert(
      originalMetadata.exif,
      "source image contains metadata before upload",
    );

    currentStep = "seed-quarantine-upload";
    const upload = await jsonRequest<UploadResponse>(
      jar,
      "/api/media/uploads",
      {
        method: "POST",
        body: { contentType: "image/jpeg", sizeBytes: original.byteLength },
      },
    );
    mediaAssetId = upload.mediaAssetId;
    await uploadBinary(upload.uploadUrl, original, "image/jpeg");

    const quarantined = await requiredDb()
      .selectFrom("media_assets")
      .select(["quarantine_key as quarantineKey"])
      .where("id", "=", mediaAssetId)
      .where("owner_user_id", "=", userId)
      .executeTakeFirstOrThrow();
    quarantineKey = quarantined.quarantineKey;
    assertSafeQuarantineKey(quarantineKey, userId);
    assert(
      await objectExists(
        store,
        requiredEnv("R2_QUARANTINE_BUCKET"),
        quarantineKey,
      ),
      "quarantine original is readable before processing",
    );

    currentStep = "seed-server-processing";
    const processed = await jsonRequest<ProcessResponse>(
      jar,
      "/api/media/process",
      {
        method: "POST",
        body: { mediaAssetId },
      },
    );
    assertEqual(processed.mediaAsset?.status, "processed", "processed status");
    assert(processed.publicUrl, "processed public URL exists");

    const media = await requiredDb()
      .selectFrom("media_assets")
      .select([
        "status",
        "derivative_key as derivativeKey",
        "original_deleted_at as originalDeletedAt",
      ])
      .where("id", "=", mediaAssetId)
      .where("owner_user_id", "=", userId)
      .executeTakeFirstOrThrow();
    assertEqual(media.status, "processed", "durable media state");
    assert(media.derivativeKey, "durable derivative reference exists");
    assert(media.originalDeletedAt, "durable original deletion marker exists");
    derivativeKey = media.derivativeKey;
    assertSafeDerivativeKey(derivativeKey, userId);
    assertEqual(
      processed.publicUrl,
      publicObjectUrl(derivativeKey),
      "public URL contract",
    );
    assert(
      !(await objectExists(
        store,
        requiredEnv("R2_QUARANTINE_BUCKET"),
        quarantineKey,
      )),
      "quarantine original is absent after processing",
    );
    assert(
      await objectExists(store, requiredEnv("R2_PUBLIC_BUCKET"), derivativeKey),
      "public derivative exists after processing",
    );
    await assertPublicDerivative(processed.publicUrl);

    currentStep = "seed-entry-readback";
    const entry = await jsonRequest<EntryResponse>(jar, "/api/garden/entries", {
      method: "POST",
      body: {
        target: "first_plant_entry",
        spaceName: "OVE-189 synthetic local space",
        plantName: "OVE-189 synthetic local object",
        objectKind: "plant",
        catalogItemId: null,
        userAddedCatalogName: "OVE-189 synthetic plant",
        varietyText: null,
        title: PROOF_TITLE,
        body: PROOF_BODY,
        entryDate: PROOF_ENTRY_DATE,
        locationVisibility: "hidden",
        coarseRegionCode: null,
        clientMutationId: randomUUID(),
        syncStatus: "online",
        activationSource: "direct_garden",
        mediaAssetId,
      },
    });
    const ownerHtml = await textRequest(jar, entry.readbackUrl);
    assertSafeMediaReadback(ownerHtml, processed.publicUrl);

    currentStep = "seed-public-readback";
    const { publishJournalEntry } =
      await import("../src/server/journal-repository");
    const published = await publishJournalEntry(
      { userId, sessionId: "ove189-local-runtime-proof" },
      { entryId: entry.entry.id, disclosureAccepted: true },
    );
    const publicHtml = await publicTextRequest(published.publicUrl);
    assertSafeMediaReadback(publicHtml, processed.publicUrl);

    currentStep = "seed-search-canary";
    const meiliDocumentId = randomUUID();
    await replaceMeiliProofIndex(search, meiliDocumentId);

    currentStep = "seed-state-write";
    await writeState({
      version: 1,
      userId,
      email,
      password,
      mediaAssetId,
      entryId: entry.entry.id,
      plantObjectId: entry.plantObject.id,
      spaceId: entry.space.id,
      quarantineKey,
      derivativeKey,
      publicUrl: processed.publicUrl,
      ownerReadbackUrl: entry.readbackUrl,
      publicReadbackPath: published.publicUrl,
      meiliIndexUid: MEILI_INDEX_UID,
      meiliDocumentId,
      fixtureDerivativeKey,
    });

    printEvidence("seed", {
      postgresCanaryWritten: true,
      searchCanaryWritten: true,
      privateOriginalUploaded: true,
      publicCopyReencoded: true,
      publicCopyMetadataStripped: true,
      privateOriginalDeleted: true,
      ownerReadbackPassed: true,
      publicReadbackPassed: true,
      visualFixtureCanaryReadable: true,
    });
  } catch (error) {
    currentStep = `${currentStep}-failed`;
    await cleanupPartialSeed({
      store,
      search,
      userId,
      mediaAssetId,
      quarantineKey,
      derivativeKey,
      email,
    });
    throw error;
  }
}

async function verifyProof() {
  currentStep = "verify-state-read";
  const state = await readState();
  const store = createObjectStoreClient();
  const search = createMeiliClient();

  // These checks intentionally happen before sign-in or any upload/write. They
  // prove all three named-volume services retained their previously seeded data.
  currentStep = "verify-postgres-readonly-canary";
  const media = await requiredDb()
    .selectFrom("media_assets")
    .select([
      "status",
      "journal_entry_id as journalEntryId",
      "derivative_key as derivativeKey",
      "original_deleted_at as originalDeletedAt",
    ])
    .where("id", "=", state.mediaAssetId)
    .where("owner_user_id", "=", state.userId)
    .executeTakeFirstOrThrow();
  assertEqual(media.status, "processed", "persisted media status");
  assertEqual(
    media.journalEntryId,
    state.entryId,
    "persisted media attachment",
  );
  assertEqual(
    media.derivativeKey,
    state.derivativeKey,
    "persisted media reference",
  );
  assert(media.originalDeletedAt, "persisted original deletion marker");
  const entry = await requiredDb()
    .selectFrom("journal_entries")
    .select(["id", "visibility", "lifecycle_state as lifecycleState"])
    .where("id", "=", state.entryId)
    .where("owner_user_id", "=", state.userId)
    .executeTakeFirstOrThrow();
  assertEqual(entry.visibility, "public", "persisted publication state");
  assertEqual(entry.lifecycleState, "active", "persisted lifecycle state");

  currentStep = "verify-minio-readonly-canaries";
  assert(
    await objectExists(
      store,
      requiredEnv("R2_PUBLIC_BUCKET"),
      state.derivativeKey,
    ),
    "persisted public copy exists",
  );
  assert(
    !(await objectExists(
      store,
      requiredEnv("R2_QUARANTINE_BUCKET"),
      state.quarantineKey,
    )),
    "persisted private original remains absent",
  );
  assert(
    await objectExists(
      store,
      requiredEnv("R2_PUBLIC_BUCKET"),
      state.fixtureDerivativeKey,
    ),
    "persisted visual fixture exists",
  );
  await assertPublicDerivative(state.publicUrl);

  currentStep = "verify-search-readonly-canary";
  const document = await search
    .index(state.meiliIndexUid)
    .getDocument<{ id: string; proofClass: string }>(state.meiliDocumentId);
  assertEqual(
    document.id,
    state.meiliDocumentId,
    "persisted search document id",
  );
  assertEqual(
    document.proofClass,
    "local_runtime_persistence",
    "search proof class",
  );

  currentStep = "verify-public-readonly-readback";
  const publicHtml = await publicTextRequest(state.publicReadbackPath);
  assertSafeMediaReadback(publicHtml, state.publicUrl);

  // Authentication creates a new session, so it is deliberately delayed until
  // every persistence canary above has already passed without mutation.
  currentStep = "verify-owner-authenticated-readback";
  const jar = new CookieJar();
  await jsonRequest<unknown>(jar, "/api/auth/sign-in/email", {
    method: "POST",
    body: {
      email: state.email,
      password: state.password,
      callbackURL: "/garden",
      rememberMe: false,
    },
  });
  const ownerHtml = await textRequest(jar, state.ownerReadbackUrl);
  assertSafeMediaReadback(ownerHtml, state.publicUrl);

  printEvidence("verify", {
    restartProofWasReadOnlyBeforeAuth: true,
    postgresDataPersisted: true,
    objectStoreDataPersisted: true,
    searchDataPersisted: true,
    privateOriginalRemainedAbsent: true,
    publicCopyStillWebp: true,
    publicCopyStillMetadataFree: true,
    ownerReadbackPassed: true,
    publicReadbackPassed: true,
    visualFixtureCanaryPersisted: true,
  });
}

async function cleanupProof() {
  currentStep = "cleanup-state-read";
  const state = await readState();
  const store = createObjectStoreClient();
  const search = createMeiliClient();

  currentStep = "cleanup-exact-synthetic-artifacts";
  await deleteObjectIfPresent(
    store,
    requiredEnv("R2_QUARANTINE_BUCKET"),
    state.quarantineKey,
  );
  await deleteObjectIfPresent(
    store,
    requiredEnv("R2_PUBLIC_BUCKET"),
    state.derivativeKey,
  );
  await deleteMeiliProofIndex(search);
  await deleteSyntheticUserRows(state.userId, state.email, state.mediaAssetId);

  currentStep = "cleanup-proof";
  assert(
    !(await objectExists(
      store,
      requiredEnv("R2_PUBLIC_BUCKET"),
      state.derivativeKey,
    )),
    "synthetic public copy removed",
  );
  const row = await requiredDb()
    .selectFrom("user")
    .select("id")
    .where("id", "=", state.userId)
    .executeTakeFirst();
  assert(!row, "synthetic account removed");
  await rm(STATE_FILE, { force: true });

  printEvidence("cleanup", {
    syntheticDatabaseRowsRemoved: true,
    syntheticMediaRemoved: true,
    syntheticSearchIndexRemoved: true,
    recoveryVolumesUntouched: true,
    visualFixturesUntouched: true,
  });
}

async function createLocalProofAccount(
  email: string,
  password: string,
  jar: CookieJar,
) {
  await jsonRequest<unknown>(jar, "/api/auth/sign-up/email", {
    method: "POST",
    body: {
      email,
      password,
      name: PRIVATE_AUTH_COMPATIBILITY_NAME,
      callbackURL: "/garden",
    },
  });

  const createdAccount = await requiredDb()
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  await requiredDb()
    .updateTable("user")
    .set({ emailVerified: true, updatedAt: new Date() })
    .where("id", "=", createdAccount.id)
    .where("email", "=", email)
    .executeTakeFirstOrThrow();

  await jsonRequest<unknown>(jar, "/api/auth/sign-in/email", {
    method: "POST",
    body: { email, password, callbackURL: "/garden", rememberMe: false },
  });

  const account = await requiredDb()
    .selectFrom("user")
    .select(["id", "emailVerified"])
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  assertEqual(account.emailVerified, true, "local account verification state");

  return account.id;
}

async function createMetadataBearingJpeg() {
  return sharp({
    create: {
      width: 96,
      height: 72,
      channels: 3,
      background: { r: 62, g: 121, b: 74 },
    },
  })
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 1 })
    .toBuffer();
}

async function assertPublicDerivative(publicUrl: string) {
  const parsed = new URL(publicUrl);
  assertEqual(
    parsed.origin,
    requiredOrigin("R2_PUBLIC_BASE_URL"),
    "public media origin",
  );
  const response = await fetch(publicUrl, {
    headers: { Accept: "image/webp" },
  });
  assertEqual(response.status, 200, "public media status");
  assert(
    response.headers.get("content-type")?.includes("image/webp"),
    "public media content type is WebP",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assertEqual(metadata.format, "webp", "public media format");
  assertEqual(metadata.exif, undefined, "public media EXIF absence");
  assertEqual(metadata.icc, undefined, "public media ICC absence");
}

function assertSafeMediaReadback(html: string, publicUrl: string) {
  assert(html.includes(publicUrl), "readback includes the public media copy");
  const lower = html.toLowerCase();
  assert(
    !lower.includes("quarantine/"),
    "readback excludes private object path",
  );
  assert(!lower.includes("latitude"), "readback excludes latitude data");
  assert(!lower.includes("longitude"), "readback excludes longitude data");
  assert(!lower.includes("gps"), "readback excludes GPS data");
}

async function replaceMeiliProofIndex(search: Meilisearch, documentId: string) {
  await deleteMeiliProofIndex(search);
  const created = await search.createIndex(MEILI_INDEX_UID, {
    primaryKey: "id",
  });
  const createTask = await search.tasks.waitForTask(created);
  assertEqual(createTask.status, "succeeded", "search index creation");
  const enqueued = await search
    .index(MEILI_INDEX_UID)
    .addDocuments([
      { id: documentId, proofClass: "local_runtime_persistence" },
    ]);
  const addTask = await search.tasks.waitForTask(enqueued);
  assertEqual(addTask.status, "succeeded", "search document write");
}

async function deleteMeiliProofIndex(search: Meilisearch) {
  try {
    const enqueued = await search.deleteIndex(MEILI_INDEX_UID);
    const task = await search.tasks.waitForTask(enqueued);
    if (task.status === "failed" && task.error?.code === "index_not_found") {
      return;
    }
    assertEqual(task.status, "succeeded", "search index cleanup");
  } catch (error) {
    if (!isMeiliMissing(error)) throw error;
  }
}

async function cleanupStaleSyntheticProofs(
  store: S3Client,
  search: Meilisearch,
) {
  await deleteMeiliProofIndex(search);
  const users = await requiredDb()
    .selectFrom("user")
    .select(["id", "email"])
    .where("email", "like", `${EMAIL_PREFIX}%${EMAIL_SUFFIX}`)
    .execute();

  for (const user of users) {
    const media = await requiredDb()
      .selectFrom("media_assets")
      .select([
        "id",
        "quarantine_key as quarantineKey",
        "derivative_key as derivativeKey",
      ])
      .where("owner_user_id", "=", user.id)
      .execute();
    for (const item of media) {
      assertSafeQuarantineKey(item.quarantineKey, user.id);
      await deleteObjectIfPresent(
        store,
        requiredEnv("R2_QUARANTINE_BUCKET"),
        item.quarantineKey,
      );
      if (item.derivativeKey) {
        assertSafeDerivativeKey(item.derivativeKey, user.id);
        await deleteObjectIfPresent(
          store,
          requiredEnv("R2_PUBLIC_BUCKET"),
          item.derivativeKey,
        );
      }
    }
    await deleteSyntheticUserRows(user.id, user.email, undefined);
  }
}

async function cleanupPartialSeed(input: {
  store: S3Client;
  search: Meilisearch;
  userId?: string;
  mediaAssetId?: string;
  quarantineKey?: string;
  derivativeKey?: string;
  email: string;
}) {
  await deleteMeiliProofIndex(input.search).catch(() => undefined);
  let resolvedUserId = input.userId;
  if (!resolvedUserId) {
    const account = await requiredDb()
      .selectFrom("user")
      .select("id")
      .where("email", "=", input.email)
      .executeTakeFirst()
      .catch(() => undefined);
    resolvedUserId = account?.id;
  }

  if (resolvedUserId) {
    const quarantineKeys = new Set<string>();
    const derivativeKeys = new Set<string>();
    if (input.quarantineKey) quarantineKeys.add(input.quarantineKey);
    if (input.derivativeKey) derivativeKeys.add(input.derivativeKey);

    const mediaRows = await requiredDb()
      .selectFrom("media_assets")
      .select([
        "quarantine_key as quarantineKey",
        "derivative_key as derivativeKey",
      ])
      .where("owner_user_id", "=", resolvedUserId)
      .execute()
      .catch(() => []);
    for (const row of mediaRows) {
      quarantineKeys.add(row.quarantineKey);
      if (row.derivativeKey) derivativeKeys.add(row.derivativeKey);
    }
    for (const key of quarantineKeys) {
      assertSafeQuarantineKey(key, resolvedUserId);
      derivativeKeys.add(expectedDerivativeKeyFromQuarantine(key));
      await deleteObjectIfPresent(
        input.store,
        requiredEnv("R2_QUARANTINE_BUCKET"),
        key,
      ).catch(() => undefined);
    }
    for (const key of derivativeKeys) {
      assertSafeDerivativeKey(key, resolvedUserId);
      await deleteObjectIfPresent(
        input.store,
        requiredEnv("R2_PUBLIC_BUCKET"),
        key,
      ).catch(() => undefined);
    }

    await deleteSyntheticUserRows(
      resolvedUserId,
      input.email,
      input.mediaAssetId,
    ).catch(() => undefined);
  }
}

async function deleteSyntheticUserRows(
  userId: string,
  email: string,
  mediaAssetId: string | undefined,
) {
  assertUuid(userId, "synthetic user id");
  assert(
    email.startsWith(EMAIL_PREFIX) && email.endsWith(EMAIL_SUFFIX),
    "synthetic email boundary",
  );
  if (mediaAssetId) assertUuid(mediaAssetId, "synthetic media id");

  await requiredDb()
    .transaction()
    .execute(async (trx) => {
      await trx
        .deleteFrom("analytics_events")
        .where("owner_user_id", "=", userId)
        .execute();
      await trx
        .deleteFrom("media_assets")
        .where("owner_user_id", "=", userId)
        .execute();
      await trx
        .deleteFrom("journal_entries")
        .where("owner_user_id", "=", userId)
        .execute();
      await trx
        .deleteFrom("plant_objects")
        .where("owner_user_id", "=", userId)
        .execute();
      await trx
        .deleteFrom("spaces")
        .where("owner_user_id", "=", userId)
        .execute();
      await trx.deleteFrom("session").where("userId", "=", userId).execute();
      await trx.deleteFrom("account").where("userId", "=", userId).execute();
      await trx
        .deleteFrom("verification")
        .where("identifier", "=", email)
        .execute();
      await trx
        .deleteFrom("user")
        .where("id", "=", userId)
        .where("email", "=", email)
        .execute();
    });
}

function createObjectStoreClient() {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    forcePathStyle: process.env.R2_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

function createMeiliClient() {
  return new Meilisearch({
    host: requiredEnv("MEILISEARCH_HOST"),
    apiKey: requiredEnv("MEILISEARCH_API_KEY"),
  });
}

async function objectExists(client: S3Client, bucket: string, key: string) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isObjectMissing(error)) return false;
    throw error;
  }
}

async function deleteObjectIfPresent(
  client: S3Client,
  bucket: string,
  key: string,
) {
  if (!(await objectExists(client, bucket, key))) return;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

async function jsonRequest<T>(
  jar: CookieJar,
  requestPath: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${requestPath}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      [ONLINE_JOURNAL_PROTOCOL_HEADER]: ONLINE_JOURNAL_PROTOCOL,
      ...(init.method && init.method !== "GET" ? { Origin: BASE_URL } : {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      Cookie: jar.header(),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  jar.addFromResponse(response);
  assert(
    response.ok,
    `request status class ${Math.floor(response.status / 100)}xx`,
  );
  return (await response.json()) as T;
}

async function textRequest(jar: CookieJar, requestPath: string) {
  const response = await fetch(`${BASE_URL}${requestPath}`, {
    headers: { Accept: "text/html", Cookie: jar.header() },
    redirect: "manual",
  });
  jar.addFromResponse(response);
  assert(
    response.ok,
    `owner readback status class ${Math.floor(response.status / 100)}xx`,
  );
  return response.text();
}

async function publicTextRequest(requestPath: string) {
  const response = await fetch(`${BASE_URL}${requestPath}`, {
    headers: { Accept: "text/html" },
    redirect: "manual",
  });
  assert(
    response.ok,
    `public readback status class ${Math.floor(response.status / 100)}xx`,
  );
  return response.text();
}

async function uploadBinary(url: string, body: Buffer, contentType: string) {
  const parsed = new URL(url);
  assertEqual(parsed.origin, requiredOrigin("R2_ENDPOINT"), "upload origin");
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  assert(
    response.ok,
    `upload status class ${Math.floor(response.status / 100)}xx`,
  );
}

async function writeState(state: RuntimeState) {
  validateState(state);
  await mkdir(STATE_DIRECTORY, { recursive: true, mode: 0o700 });
  await chmod(STATE_DIRECTORY, 0o700);
  const temporary = `${STATE_FILE}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, STATE_FILE);
  await chmod(STATE_FILE, 0o600);
}

async function readState(): Promise<RuntimeState> {
  const state = JSON.parse(await readFile(STATE_FILE, "utf8")) as RuntimeState;
  validateState(state);
  return state;
}

async function assertStateAbsent() {
  try {
    await readFile(STATE_FILE, "utf8");
    throw new Error("proof state already exists; verify or cleanup it first");
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return;
    throw error;
  }
}

function validateState(state: RuntimeState) {
  assertEqual(state.version, 1, "proof state version");
  assertUuid(state.userId, "proof user id");
  assertUuid(state.mediaAssetId, "proof media id");
  assertUuid(state.entryId, "proof entry id");
  assertUuid(state.plantObjectId, "proof object id");
  assertUuid(state.spaceId, "proof space id");
  assertUuid(state.meiliDocumentId, "proof search document id");
  assert(
    state.email.startsWith(EMAIL_PREFIX) && state.email.endsWith(EMAIL_SUFFIX),
    "proof email boundary",
  );
  assert(state.password.startsWith("ove189-"), "proof password boundary");
  assertSafeQuarantineKey(state.quarantineKey, state.userId);
  assertSafeDerivativeKey(state.derivativeKey, state.userId);
  assertEqual(
    state.publicUrl,
    publicObjectUrl(state.derivativeKey),
    "proof media URL",
  );
  assert(
    state.ownerReadbackUrl.startsWith("/garden/objects/"),
    "owner readback path",
  );
  assert(
    state.publicReadbackPath.startsWith("/journal/"),
    "public readback path",
  );
  assertEqual(state.meiliIndexUid, MEILI_INDEX_UID, "proof search index");
  assert(
    state.fixtureDerivativeKey.startsWith(
      `${VISUAL_FIXTURE_MANIFEST.namespace}/`,
    ),
    "fixture canary namespace",
  );
}

function assertSafeQuarantineKey(key: string, userId: string) {
  assert(
    key.startsWith(`quarantine/${userId}/`),
    "private object ownership boundary",
  );
  assert(!key.includes(".."), "private object traversal boundary");
}

function assertSafeDerivativeKey(key: string, userId: string) {
  assert(
    key.startsWith(`derivatives/${userId}/`),
    "public object ownership boundary",
  );
  assert(key.endsWith(".webp"), "public object format boundary");
  assert(!key.includes(".."), "public object traversal boundary");
}

function expectedDerivativeKeyFromQuarantine(key: string) {
  return key
    .replace(/^quarantine\//, "derivatives/")
    .replace(/\.[^.]+$/, ".webp");
}

function publicObjectUrl(key: string) {
  const base = requiredEnv("R2_PUBLIC_BASE_URL");
  return new URL(key, base.endsWith("/") ? base : `${base}/`).toString();
}

function parsePhase(argv: string[]): Phase {
  const normalized = argv.filter((argument) => argument !== "--");
  if (normalized.length !== 2 || normalized[0] !== "--phase") {
    throw new Error("use --phase seed, verify, or cleanup");
  }
  const phase = normalized[1];
  if (phase !== "seed" && phase !== "verify" && phase !== "cleanup") {
    throw new Error("unsupported proof phase");
  }
  return phase;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredOrigin(name: string) {
  return new URL(requiredEnv(name)).origin;
}

function requiredDb() {
  if (!db) throw new Error("database is not initialized");
  return db;
}

function assertUuid(value: string, label: string) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
    label,
  );
}

function isObjectMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode === 404
  );
}

function isMeiliMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "index_not_found"
  );
}

function isNodeError(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function getSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  const fromGetter = withGetter.getSetCookie?.();
  if (fromGetter && fromGetter.length > 0) return fromGetter;
  const combined = headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[^;,]+=)/) : [];
}

function printEvidence(phase: Phase, evidence: Record<string, boolean>) {
  console.log(
    JSON.stringify({ ok: true, issue: "OVE-189", phase, ...evidence }, null, 2),
  );
}

void main()
  .catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        issue: "OVE-189",
        step: currentStep,
        errorClass: error instanceof Error ? error.name : "UnknownError",
      }),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.destroy();
  });
