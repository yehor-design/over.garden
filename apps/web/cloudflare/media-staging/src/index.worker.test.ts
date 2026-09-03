import { env, exports } from "cloudflare:workers";
import {
  reset as resetCloudflareState,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { setupNetwork } from "@msw/cloudflare";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS,
  EPHEMERAL_MEDIA_OWNER_UPLOADS_PER_MINUTE,
} from "../../../src/lib/media/ephemeral-staging-contract";
import { signEphemeralMediaText } from "../../../src/lib/media/ephemeral-staging-crypto";
import {
  issueWorkerSessionCapabilityForTest,
  issueWorkerStagingSessionForTest,
  issueWorkerUploadCapabilityForTest,
} from "./test-capabilities";

const network = setupNetwork();

beforeAll(() => network.enable());
afterEach(async () => {
  network.resetHandlers();
  await resetCloudflareState();
});
afterAll(() => network.disable());

describe("media staging Worker in workerd", () => {
  it("persists a checksum-verified WebP through R2 and the SQLite Durable Object", async () => {
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", webp)),
      ),
    );
    const session = crypto.randomUUID();
    const media = crypto.randomUUID();
    const reservation = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: crypto.randomUUID(),
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 1,
      sha256: sha,
      sizeBytes: webp.byteLength,
      width: 1,
      height: 1,
    });

    const response = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${reservation.capability}`,
            "content-type": "image/webp",
            "content-length": String(webp.byteLength),
            "content-sha256": sha,
            "x-media-width": "1",
            "x-media-height": "1",
            origin: "https://over.garden",
          },
          body: webp,
        },
      ),
    );
    const receipt = (await response.json()) as Record<string, unknown>;
    expect(response.status, JSON.stringify(receipt)).toBe(201);
    expect(receipt).toEqual(
      expect.objectContaining({
        status: "staged",
        stagingReceipt: expect.any(String),
        deleteCapability: expect.any(String),
        leaseExpiresAt: expect.any(String),
      }),
    );

    const replay = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        {
          method: "PUT",
          headers: {
            authorization: `Bearer ${reservation.capability}`,
            "content-type": "image/webp",
            "content-length": String(webp.byteLength),
            "content-sha256": sha,
            "x-media-width": "1",
            "x-media-height": "1",
          },
          body: webp,
        },
      ),
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(receipt);
    expect(await env.MEDIA_STAGING_BUCKET.list()).toMatchObject({
      objects: [expect.anything()],
    });

    const deleted = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        {
          method: "DELETE",
          headers: {
            authorization: `Bearer ${String(receipt.deleteCapability)}`,
          },
        },
      ),
    );
    expect(deleted.status).toBe(200);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
  });

  it("recovers an interrupted upload through a fresh object-specific reservation", async () => {
    const owner = crypto.randomUUID();
    const stagingSessionId = crypto.randomUUID();
    const mediaAssetId = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = await sha256Base64(webp);
    const first = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId,
      mediaAssetId,
      generation: 1,
      sha256: sha,
      sizeBytes: webp.byteLength,
      width: 1,
      height: 1,
    });
    const firstClaims = decodeCapability(first.capability);
    const storageDigest = await signEphemeralMediaText(
      env.EPHEMERAL_MEDIA_COMMIT_STATUS_SECRET,
      "staging-object",
      [
        firstClaims.ownerSubjectHash,
        stagingSessionId,
        mediaAssetId,
        "1",
        sha,
      ].join("\0"),
    );
    const stub = env.MEDIA_STAGING_SESSIONS.getByName(stagingSessionId);
    await expect(
      stub.beginUpload({
        ownerSubjectHash: firstClaims.ownerSubjectHash,
        stagingSessionId,
        mediaAssetId,
        generation: 1,
        variant: 0,
        sha256: sha,
        sizeBytes: webp.byteLength,
        width: 1,
        height: 1,
        nonce: firstClaims.nonce,
        storageKey: `staging/${storageDigest}.webp`,
        nowMs: Date.now(),
        deadlineAtMs: Date.now() + 5_000,
      }),
    ).resolves.toEqual(expect.objectContaining({ status: "accepted" }));

    const fresh = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId,
      mediaAssetId,
      generation: 1,
      sha256: sha,
      sizeBytes: webp.byteLength,
      width: 1,
      height: 1,
    });
    const url = `https://media-stage.over.garden/v1/staging/${stagingSessionId}/${mediaAssetId}/1`;
    const recovered = await exports.default.fetch(
      uploadRequest(url, fresh.capability, webp, sha),
    );
    const recoveredReceipt = await recovered.clone().json();
    expect(recovered.status, JSON.stringify(recoveredReceipt)).toBe(200);
    expect(recoveredReceipt).toEqual(
      expect.objectContaining({ status: "staged" }),
    );
    const replay = await exports.default.fetch(
      uploadRequest(url, first.capability, webp, sha),
    );
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(recoveredReceipt);
  });

  it("shares a fail-closed owner admission budget across fresh session IDs", async () => {
    const owner = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", webp)),
      ),
    );

    for (
      let index = 0;
      index < EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS;
      index += 1
    ) {
      const response = await uploadForOwner({ owner, webp, sha });
      expect(response.status).toBe(201);
    }

    const rejected = await uploadForOwner({ owner, webp, sha });
    expect(rejected.status).toBe(429);
    await expect(rejected.json()).resolves.toEqual({
      code: "owner_session_limit",
    });
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(
      EPHEMERAL_MEDIA_OWNER_MAX_ACTIVE_SESSIONS,
    );

    const otherOwner = await uploadForOwner({
      owner: crypto.randomUUID(),
      webp,
      sha,
    });
    expect(otherOwner.status).toBe(201);
  });

  it("bounds upload attempts for one owner even when one session is replayed", async () => {
    const owner = crypto.randomUUID();
    const stagingSessionId = crypto.randomUUID();
    const mediaAssetId = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", webp)),
      ),
    );
    const issued = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId,
      mediaAssetId,
      generation: 1,
      sha256: sha,
      sizeBytes: webp.byteLength,
      width: 1,
      height: 1,
    });
    const url = `https://media-stage.over.garden/v1/staging/${stagingSessionId}/${mediaAssetId}/1`;

    for (
      let attempt = 0;
      attempt < EPHEMERAL_MEDIA_OWNER_UPLOADS_PER_MINUTE;
      attempt += 1
    ) {
      const response = await exports.default.fetch(
        uploadRequest(url, issued.capability, webp, sha),
      );
      expect(response.status).toBe(attempt === 0 ? 201 : 200);
    }

    const rejected = await exports.default.fetch(
      uploadRequest(url, issued.capability, webp, sha),
    );
    expect(rejected.status).toBe(429);
    await expect(rejected.json()).resolves.toEqual({
      code: "owner_rate_limit",
    });
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(1);
  });

  it("keeps every superseded key in a durable delete ledger until R2 absence is acknowledged", async () => {
    const owner = crypto.randomUUID();
    const stagingSessionId = crypto.randomUUID();
    const mediaAssetId = crypto.randomUUID();
    const first = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const second = new Uint8Array(first);
    second[11] = 81;
    const firstSha = await sha256Base64(first);
    const secondSha = await sha256Base64(second);
    const firstIssued = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId,
      mediaAssetId,
      generation: 1,
      sha256: firstSha,
      sizeBytes: first.byteLength,
      width: 1,
      height: 1,
    });
    const firstResponse = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${stagingSessionId}/${mediaAssetId}/1`,
        firstIssued.capability,
        first,
        firstSha,
      ),
    );
    expect(firstResponse.status).toBe(201);
    const firstKey = (await env.MEDIA_STAGING_BUCKET.list()).objects[0]!.key;

    const secondIssued = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId,
      mediaAssetId,
      generation: 2,
      sha256: secondSha,
      sizeBytes: second.byteLength,
      width: 1,
      height: 1,
    });
    const secondResponse = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${stagingSessionId}/${mediaAssetId}/2`,
        secondIssued.capability,
        second,
        secondSha,
      ),
    );
    expect(secondResponse.status).toBe(201);
    const afterReplacement = await env.MEDIA_STAGING_BUCKET.list();
    expect(afterReplacement.objects).toHaveLength(1);
    expect(afterReplacement.objects[0]!.key).not.toBe(firstKey);

    const stub = env.MEDIA_STAGING_SESSIONS.getByName(stagingSessionId);
    let ownerSubjectHash = "";
    await runInDurableObject(stub, (_instance, state) => {
      ownerSubjectHash = String(
        state.storage.sql
          .exec<{
            owner_subject_hash: string;
          }>(
            "SELECT owner_subject_hash FROM staging_session WHERE singleton = 1",
          )
          .toArray()[0]!.owner_subject_hash,
      );
      expect(
        state.storage.sql
          .exec<{
            count: number;
          }>("SELECT COUNT(*) AS count FROM staging_pending_delete")
          .toArray()[0]!.count,
      ).toBe(0);
    });

    const crashTransition = await stub.beginUpload({
      ownerSubjectHash,
      stagingSessionId,
      mediaAssetId,
      generation: 3,
      variant: 0,
      sha256: firstSha,
      sizeBytes: first.byteLength,
      width: 1,
      height: 1,
      nonce: "crashtransitionnonce1234",
      storageKey: `staging/${"C".repeat(43)}.webp`,
      nowMs: Date.now(),
      deadlineAtMs: Date.now() + 5_000,
    });
    expect(crashTransition).toEqual(
      expect.objectContaining({
        status: "accepted",
        supersededStorageKeys: [afterReplacement.objects[0]!.key],
      }),
    );
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{
            storage_key: string;
          }>("SELECT storage_key FROM staging_pending_delete")
          .toArray(),
      ).toEqual([{ storage_key: afterReplacement.objects[0]!.key }]);
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = 0 WHERE singleton = 1",
      );
      state.storage.sql.exec(
        "UPDATE staging_media SET lease_expires_at_ms = 0",
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{
            count: number;
          }>("SELECT COUNT(*) AS count FROM staging_pending_delete")
          .toArray()[0]!.count,
      ).toBe(0);
    });
  });

  it("never adopts or deletes a colliding public object owned by another staging session", async () => {
    const mediaAssetId = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const victim = await stageForOwner({
      owner: crypto.randomUUID(),
      stagingSessionId: crypto.randomUUID(),
      mediaAssetId,
      webp,
    });
    const victimPublishId = crypto.randomUUID();
    const victimClaim = await claimStagedSession({
      owner: victim.owner,
      stagingSessionId: victim.stagingSessionId,
      publishId: victimPublishId,
      stagingReceipts: [victim.stagingReceipt],
    });
    expect(victimClaim.response.status).toBe(200);
    const publicPath = victimClaim.publicPaths[0]!;
    const victimObject = await env.PUBLIC_MEDIA_BUCKET.head(publicPath);
    expect(victimObject?.customMetadata?.ownershipProof).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );

    const attacker = await stageForOwner({
      owner: crypto.randomUUID(),
      stagingSessionId: crypto.randomUUID(),
      mediaAssetId,
      webp,
    });
    const attackerPublishId = crypto.randomUUID();
    const attackerClaim = await claimStagedSession({
      owner: attacker.owner,
      stagingSessionId: attacker.stagingSessionId,
      publishId: attackerPublishId,
      stagingReceipts: [attacker.stagingReceipt],
    });
    expect(attackerClaim.response.status).toBe(409);
    await expect(attackerClaim.response.clone().json()).resolves.toEqual({
      code: "public_object_collision",
    });

    const attackerStub = env.MEDIA_STAGING_SESSIONS.getByName(
      attacker.stagingSessionId,
    );
    await runInDurableObject(attackerStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE staging_session SET lease_expires_at_ms = 0,
           absent_readbacks = 1 WHERE singleton = 1`,
      );
    });
    network.use(
      http.post("https://over.garden/api/media/staging/commit-status", () =>
        HttpResponse.json({ status: "absent" }),
      ),
    );
    expect(await runDurableObjectAlarm(attackerStub)).toBe(true);
    const afterCleanup = await env.PUBLIC_MEDIA_BUCKET.head(publicPath);
    expect(afterCleanup?.customMetadata?.ownershipProof).toBe(
      victimObject?.customMetadata?.ownershipProof,
    );
    await expect(attackerStub.redactedState()).resolves.toEqual(
      expect.objectContaining({ sessionState: "abandoned" }),
    );
  });

  it("recovers durable finalizing and abandoning fences without letting their effects cross", async () => {
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const finalizing = await stageForOwner({
      owner: crypto.randomUUID(),
      stagingSessionId: crypto.randomUUID(),
      mediaAssetId: crypto.randomUUID(),
      webp,
    });
    const finalizingPublishId = crypto.randomUUID();
    const finalizingClaim = await claimStagedSession({
      owner: finalizing.owner,
      stagingSessionId: finalizing.stagingSessionId,
      publishId: finalizingPublishId,
      stagingReceipts: [finalizing.stagingReceipt],
    });
    expect(finalizingClaim.response.status).toBe(200);
    const finalizingStub = env.MEDIA_STAGING_SESSIONS.getByName(
      finalizing.stagingSessionId,
    );
    await runInDurableObject(finalizingStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE staging_session SET state = 'finalizing',
           lease_expires_at_ms = 0, state_version = state_version + 1
         WHERE singleton = 1`,
      );
    });
    network.use(
      http.post("https://over.garden/api/media/staging/commit-status", () =>
        HttpResponse.json({ status: "absent" }),
      ),
    );
    expect(await runDurableObjectAlarm(finalizingStub)).toBe(true);
    await expect(finalizingStub.redactedState()).resolves.toEqual(
      expect.objectContaining({ sessionState: "committed" }),
    );
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    expect(
      await env.PUBLIC_MEDIA_BUCKET.head(finalizingClaim.publicPaths[0]!),
    ).toMatchObject({
      customMetadata: expect.objectContaining({
        publicationState: "committed",
      }),
    });

    const abandoning = await stageForOwner({
      owner: crypto.randomUUID(),
      stagingSessionId: crypto.randomUUID(),
      mediaAssetId: crypto.randomUUID(),
      webp,
    });
    const abandoningPublishId = crypto.randomUUID();
    const abandoningClaim = await claimStagedSession({
      owner: abandoning.owner,
      stagingSessionId: abandoning.stagingSessionId,
      publishId: abandoningPublishId,
      stagingReceipts: [abandoning.stagingReceipt],
    });
    expect(abandoningClaim.response.status).toBe(200);
    const abandoningStub = env.MEDIA_STAGING_SESSIONS.getByName(
      abandoning.stagingSessionId,
    );
    await runInDurableObject(abandoningStub, (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE staging_session SET state = 'abandoning',
           lease_expires_at_ms = 0, state_version = state_version + 1
         WHERE singleton = 1`,
      );
    });
    const finalizeCapability = await issueWorkerSessionCapabilityForTest(env, {
      ownerUserId: abandoning.owner,
      stagingSessionId: abandoning.stagingSessionId,
      publishId: abandoningPublishId,
      stagingReceipts: [abandoning.stagingReceipt],
      purpose: "finalize",
    });
    const lateFinalize = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${abandoning.stagingSessionId}/finalize`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${finalizeCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ publishId: abandoningPublishId }),
        },
      ),
    );
    expect(lateFinalize.status).toBe(409);
    expect(await runDurableObjectAlarm(abandoningStub)).toBe(true);
    await expect(abandoningStub.redactedState()).resolves.toEqual(
      expect.objectContaining({ sessionState: "abandoned" }),
    );
    expect(
      await env.PUBLIC_MEDIA_BUCKET.head(abandoningClaim.publicPaths[0]!),
    ).toBeNull();
  });

  it("rejects checksum mismatch and an eleventh active image without leakage", async () => {
    const good = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const bad = new Uint8Array(good);
    bad[11] = 81;
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", good)),
      ),
    );
    const session = crypto.randomUUID();
    const owner = crypto.randomUUID();
    const uploaded: Array<{ url: string; deleteCapability: string }> = [];
    for (let index = 0; index < 10; index += 1) {
      const media = crypto.randomUUID();
      const issued = await issueWorkerUploadCapabilityForTest(env, {
        ownerUserId: owner,
        stagingSessionId: session,
        mediaAssetId: media,
        generation: 1,
        sha256: sha,
        sizeBytes: good.byteLength,
        width: 1,
        height: 1,
      });
      const url = `https://media-stage.over.garden/v1/staging/${session}/${media}/1`;
      const response = await exports.default.fetch(
        uploadRequest(url, issued.capability, good, sha),
      );
      const receipt = (await response.json()) as { deleteCapability: string };
      expect(response.status, JSON.stringify(receipt)).toBe(201);
      uploaded.push({ url, deleteCapability: receipt.deleteCapability });
    }
    const eleventhMedia = crypto.randomUUID();
    const eleventh = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      mediaAssetId: eleventhMedia,
      generation: 1,
      sha256: sha,
      sizeBytes: good.byteLength,
      width: 1,
      height: 1,
    });
    const eleventhResponse = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${session}/${eleventhMedia}/1`,
        eleventh.capability,
        good,
        sha,
      ),
    );
    expect(eleventhResponse.status).toBe(409);
    await expect(eleventhResponse.json()).resolves.toEqual({
      code: "session_media_limit",
    });

    const mismatchSession = crypto.randomUUID();
    const mismatchMedia = crypto.randomUUID();
    const mismatch = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: mismatchSession,
      mediaAssetId: mismatchMedia,
      generation: 1,
      sha256: sha,
      sizeBytes: bad.byteLength,
      width: 1,
      height: 1,
    });
    const mismatchResponse = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${mismatchSession}/${mismatchMedia}/1`,
        mismatch.capability,
        bad,
        sha,
      ),
    );
    expect(mismatchResponse.status).toBe(422);
    await expect(mismatchResponse.json()).resolves.toEqual({
      code: "checksum_mismatch",
    });

    for (const item of uploaded) {
      const response = await exports.default.fetch(
        new Request(item.url, {
          method: "DELETE",
          headers: { authorization: `Bearer ${item.deleteCapability}` },
        }),
      );
      expect(response.status).toBe(200);
    }
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
  });

  it("claims once, retains on an indeterminate alarm, then finalizes only after a signed committed read-back", async () => {
    const owner = crypto.randomUUID();
    const session = crypto.randomUUID();
    const publishId = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", webp)),
      ),
    );
    const receipts: string[] = [];
    const receiptMediaOrder = [
      "ffffffff-ffff-4fff-8fff-fffffffffff1",
      "00000000-0000-4000-8000-000000000001",
    ];
    for (let index = 0; index < 2; index += 1) {
      const media = receiptMediaOrder[index]!;
      const issued = await issueWorkerUploadCapabilityForTest(env, {
        ownerUserId: owner,
        stagingSessionId: session,
        mediaAssetId: media,
        generation: 1,
        sha256: sha,
        sizeBytes: webp.byteLength,
        width: 1,
        height: 1,
      });
      const response = await exports.default.fetch(
        uploadRequest(
          `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
          issued.capability,
          webp,
          sha,
        ),
      );
      expect(response.status).toBe(201);
      receipts.push(
        String(
          ((await response.json()) as { stagingReceipt: string })
            .stagingReceipt,
        ),
      );
    }
    const claimCapability = await issueWorkerSessionCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      publishId,
      stagingReceipts: receipts,
      purpose: "claim",
    });
    const claimRequest = () =>
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/claim`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${claimCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ publishId, stagingReceipts: receipts }),
        },
      );
    const stub = env.MEDIA_STAGING_SESSIONS.getByName(session);
    const inFlightMedia = crypto.randomUUID();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO staging_media (
           media_asset_id, generation, sha256, size_bytes, width, height,
           capability_nonce, staging_key, state, upload_attempt,
           public_ready, lease_expires_at_ms
         ) VALUES (?, 1, ?, ?, 1, 1, ?, ?, 'uploading', 1, 0, ?)`,
        inFlightMedia,
        sha,
        webp.byteLength,
        "n_1234567890abcdef",
        "staging/in-flight.webp",
        Date.now() + 900_000,
      );
    });
    const blockedByInFlight = await exports.default.fetch(claimRequest());
    expect(blockedByInFlight.status).toBe(409);
    await expect(blockedByInFlight.json()).resolves.toEqual({
      code: "receipt_set_mismatch",
    });
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM staging_media WHERE media_asset_id = ?",
        inFlightMedia,
      );
    });
    const concurrentClaims = await Promise.all(
      Array.from({ length: 10 }, () => exports.default.fetch(claimRequest())),
    );
    expect(concurrentClaims.map((response) => response.status)).toEqual(
      Array.from({ length: 10 }, () => 200),
    );
    const claimReceipt = (await concurrentClaims[0]!.json()) as {
      publicMedia: Array<{ mediaAssetId: string; publicPath: string }>;
    };
    expect(claimReceipt.publicMedia).toHaveLength(2);
    expect(claimReceipt.publicMedia.map((item) => item.mediaAssetId)).toEqual(
      receiptMediaOrder,
    );
    expect((await env.PUBLIC_MEDIA_BUCKET.list()).objects).toHaveLength(2);
    const claimedObject = await env.PUBLIC_MEDIA_BUCKET.head(
      claimReceipt.publicMedia[0]!.publicPath,
    );
    expect(claimedObject?.httpMetadata?.cacheControl).toBe("private, no-store");
    expect(claimedObject?.customMetadata?.publicationState).toBe("claimed");
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_media SET public_ready = 0 WHERE media_asset_id = (SELECT media_asset_id FROM staging_media ORDER BY media_asset_id LIMIT 1)",
      );
    });
    const recoveredPromotion = await exports.default.fetch(claimRequest());
    expect(recoveredPromotion.status).toBe(200);
    expect((await env.PUBLIC_MEDIA_BUCKET.list()).objects).toHaveLength(2);

    let signedReadbackObserved = false;
    network.use(
      http.post(
        "https://over.garden/api/media/staging/commit-status",
        async ({ request }) => {
          signedReadbackObserved = /^v1:[A-Za-z0-9_-]{43}$/.test(
            request.headers.get("x-overgarden-staging-signature") ?? "",
          );
          return HttpResponse.json({ status: "indeterminate" });
        },
      ),
    );
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = 0 WHERE singleton = 1",
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(signedReadbackObserved).toBe(true);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(2);
    expect((await env.PUBLIC_MEDIA_BUCKET.list()).objects).toHaveLength(2);

    network.resetHandlers();
    network.use(
      http.post("https://over.garden/api/media/staging/commit-status", () =>
        HttpResponse.json({ status: "committed" }),
      ),
    );
    const wrongFinalizeCapability = await issueWorkerSessionCapabilityForTest(
      env,
      {
        ownerUserId: owner,
        stagingSessionId: session,
        publishId,
        stagingReceipts: [...receipts].reverse(),
        purpose: "finalize",
      },
    );
    const rejectedFinalize = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/finalize`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${wrongFinalizeCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ publishId }),
        },
      ),
    );
    expect(rejectedFinalize.status).toBe(409);
    await expect(rejectedFinalize.json()).resolves.toEqual({
      code: "receipt_set_mismatch",
    });
    const finalizeCapability = await issueWorkerSessionCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      publishId,
      stagingReceipts: receipts,
      purpose: "finalize",
    });
    const finalized = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/finalize`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${finalizeCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ publishId }),
        },
      ),
    );
    expect(finalized.status).toBe(200);
    await expect(finalized.json()).resolves.toEqual({ status: "finalized" });
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    expect((await env.PUBLIC_MEDIA_BUCKET.list()).objects).toHaveLength(2);
    const finalizedObject = await env.PUBLIC_MEDIA_BUCKET.head(
      claimReceipt.publicMedia[0]!.publicPath,
    );
    expect(finalizedObject?.httpMetadata?.cacheControl).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(finalizedObject?.customMetadata?.publicationState).toBe("committed");
  });

  it("alarm deletes an abandoned open stage and keeps only a bounded terminal receipt", async () => {
    const owner = crypto.randomUUID();
    const session = crypto.randomUUID();
    const media = crypto.randomUUID();
    const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const sha = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", webp)),
      ),
    );
    const issued = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 1,
      sha256: sha,
      sizeBytes: webp.byteLength,
      width: 1,
      height: 1,
    });
    const response = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        issued.capability,
        webp,
        sha,
      ),
    );
    expect(response.status).toBe(201);
    const receipt = (await response.json()) as { stagingReceipt: string };
    const stub = env.MEDIA_STAGING_SESSIONS.getByName(session);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = 0 WHERE singleton = 1",
      );
      state.storage.sql.exec(
        "UPDATE staging_media SET lease_expires_at_ms = 0",
      );
    });
    const publishId = crypto.randomUUID();
    const claimCapability = await issueWorkerSessionCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      publishId,
      stagingReceipts: [receipt.stagingReceipt],
      purpose: "claim",
    });
    const expiredClaim = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/claim`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${claimCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            publishId,
            stagingReceipts: [receipt.stagingReceipt],
          }),
        },
      ),
    );
    expect(expiredClaim.status).toBe(409);
    await expect(expiredClaim.json()).resolves.toEqual({
      code: "receipt_expired",
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    await expect(stub.redactedState()).resolves.toEqual(
      expect.objectContaining({
        sessionState: "abandoned",
        mediaStates: [{ state: "deleted", count: 1 }],
      }),
    );
  });

  it("stages, claims, and finalizes a photo's variants with its primary", async () => {
    const owner = crypto.randomUUID();
    const session = crypto.randomUUID();
    const publishId = crypto.randomUUID();
    const media = crypto.randomUUID();
    const objects = [
      { variant: 0, width: 2560, height: 1920, tail: 0 },
      { variant: 1280, width: 1280, height: 960, tail: 1 },
      { variant: 480, width: 480, height: 360, tail: 2 },
    ] as const;
    const receipts: string[] = [];
    const bytesByVariant = new Map<number, Uint8Array>();
    for (const object of objects) {
      const webp = new Uint8Array([
        82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, object.tail,
      ]);
      bytesByVariant.set(object.variant, webp);
      const sha = await sha256Base64(webp);
      const issued = await issueWorkerUploadCapabilityForTest(env, {
        ownerUserId: owner,
        stagingSessionId: session,
        mediaAssetId: media,
        generation: 1,
        variant: object.variant,
        sha256: sha,
        sizeBytes: webp.byteLength,
        width: object.width,
        height: object.height,
      });
      const response = await exports.default.fetch(
        uploadRequest(
          `https://media-stage.over.garden/v1/staging/${session}/${media}/1${object.variant ? `/v${object.variant}` : ""}`,
          issued.capability,
          webp,
          sha,
          { width: object.width, height: object.height },
        ),
      );
      const body = (await response.json()) as { stagingReceipt: string };
      expect(response.status, JSON.stringify(body)).toBe(201);
      receipts.push(body.stagingReceipt);
    }
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(3);

    const claimed = await claimStagedSession({
      owner,
      stagingSessionId: session,
      publishId,
      stagingReceipts: receipts,
    });
    expect(claimed.response.status).toBe(200);
    expect(claimed.publicPaths).toEqual([
      `derivatives/${media}/1.webp`,
      `derivatives/${media}/1-1280.webp`,
      `derivatives/${media}/1-480.webp`,
    ]);
    expect((await env.PUBLIC_MEDIA_BUCKET.list()).objects).toHaveLength(3);

    let expectedMedia: unknown = null;
    network.use(
      http.post(
        "https://over.garden/api/media/staging/commit-status",
        async ({ request }) => {
          expectedMedia = (
            (await request.json()) as { expectedMedia: unknown }
          ).expectedMedia;
          return HttpResponse.json({ status: "committed" });
        },
      ),
    );
    const finalizeCapability = await issueWorkerSessionCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      publishId,
      stagingReceipts: receipts,
      purpose: "finalize",
    });
    const finalized = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/finalize`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${finalizeCapability.capability}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ publishId }),
        },
      ),
    );
    expect(finalized.status).toBe(200);
    // The read-back names every object; only variants carry the field.
    expect(expectedMedia).toEqual([
      expect.objectContaining({
        mediaAssetId: media,
        generation: 1,
        width: 2560,
        height: 1920,
        publicKey: `derivatives/${media}/1.webp`,
      }),
      expect.objectContaining({
        mediaAssetId: media,
        variant: 1280,
        width: 1280,
        publicKey: `derivatives/${media}/1-1280.webp`,
      }),
      expect.objectContaining({
        mediaAssetId: media,
        variant: 480,
        width: 480,
        publicKey: `derivatives/${media}/1-480.webp`,
      }),
    ]);
    expect((expectedMedia as Array<Record<string, unknown>>)[0]).not.toHaveProperty(
      "variant",
    );
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    for (const object of objects) {
      const promoted = await env.PUBLIC_MEDIA_BUCKET.head(
        `derivatives/${media}/1${object.variant ? `-${object.variant}` : ""}.webp`,
      );
      expect(promoted?.size).toBe(bytesByVariant.get(object.variant)!.byteLength);
      expect(promoted?.httpMetadata?.cacheControl).toBe(
        "public, max-age=31536000, immutable",
      );
    }
  });

  it("deletes a photo's variants with its primary and counts the session limit per photo", async () => {
    const owner = crypto.randomUUID();
    const session = crypto.randomUUID();
    const media = crypto.randomUUID();
    const primary = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]);
    const variant = new Uint8Array([
      82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 7,
    ]);
    const primarySha = await sha256Base64(primary);
    const primaryCapability = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 1,
      sha256: primarySha,
      sizeBytes: primary.byteLength,
      width: 2000,
      height: 1000,
    });
    const staged = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        primaryCapability.capability,
        primary,
        primarySha,
        { width: 2000, height: 1000 },
      ),
    );
    const stagedBody = (await staged.json()) as { deleteCapability: string };
    expect(staged.status).toBe(201);
    const variantSha = await sha256Base64(variant);
    const variantCapability = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      mediaAssetId: media,
      generation: 1,
      variant: 480,
      sha256: variantSha,
      sizeBytes: variant.byteLength,
      width: 480,
      height: 240,
    });
    expect(
      (
        await exports.default.fetch(
          uploadRequest(
            `https://media-stage.over.garden/v1/staging/${session}/${media}/1/v480`,
            variantCapability.capability,
            variant,
            variantSha,
            { width: 480, height: 240 },
          ),
        )
      ).status,
    ).toBe(201);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(2);

    // Nine more photos, some with a variant, still fit: the limit counts
    // photos, and the owner's upload budget (20 per minute) is not touched.
    for (let index = 0; index < 9; index += 1) {
      const other = await stageForOwner({
        owner,
        stagingSessionId: session,
        mediaAssetId: crypto.randomUUID(),
        webp: new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 10 + index]),
      });
      if (index % 2 === 1) continue;
      const otherVariant = new Uint8Array([
        82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 40 + index,
      ]);
      const otherVariantSha = await sha256Base64(otherVariant);
      const otherVariantCapability = await issueWorkerUploadCapabilityForTest(
        env,
        {
          ownerUserId: owner,
          stagingSessionId: session,
          mediaAssetId: other.mediaAssetId,
          generation: 1,
          variant: 480,
          sha256: otherVariantSha,
          sizeBytes: otherVariant.byteLength,
          width: 1,
          height: 1,
        },
      );
      expect(
        (
          await exports.default.fetch(
            uploadRequest(
              `https://media-stage.over.garden/v1/staging/${session}/${other.mediaAssetId}/1/v480`,
              otherVariantCapability.capability,
              otherVariant,
              otherVariantSha,
            ),
          )
        ).status,
      ).toBe(201);
    }
    const eleventhSha = await sha256Base64(
      new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 99]),
    );
    const eleventhCapability = await issueWorkerUploadCapabilityForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
      mediaAssetId: crypto.randomUUID(),
      generation: 1,
      sha256: eleventhSha,
      sizeBytes: 13,
      width: 1,
      height: 1,
    });
    const eleventh = await exports.default.fetch(
      uploadRequest(
        `https://media-stage.over.garden/v1/staging/${session}/${crypto.randomUUID()}/1`,
        eleventhCapability.capability,
        new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 99]),
        eleventhSha,
      ),
    );
    // Under a session capability the path names the photo: an eleventh one.
    expect(eleventh.status).toBe(409);
    await expect(eleventh.json()).resolves.toEqual({
      code: "session_media_limit",
    });

    const deleted = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/${media}/1`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${stagedBody.deleteCapability}` },
        },
      ),
    );
    expect(deleted.status).toBe(200);
    const remaining = (await env.MEDIA_STAGING_BUCKET.list()).objects;
    // The photo's primary and its 480 variant are both gone; the other nine
    // photos and their five variants stay.
    expect(remaining).toHaveLength(14);
  });

  it("touches extend a two-hour lease and an untouched session is abandoned only at its expiry (OVE-372)", async () => {
    const owner = crypto.randomUUID();
    const session = crypto.randomUUID();
    const media = crypto.randomUUID();
    const staged = await stageForOwner({
      owner,
      stagingSessionId: session,
      mediaAssetId: media,
      webp: new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 5]),
    });
    expect(staged.stagingReceipt).toEqual(expect.any(String));
    const stub = env.MEDIA_STAGING_SESSIONS.getByName(session);
    const readLease = () =>
      runInDurableObject(stub, (_instance, state) => {
        const row = state.storage.sql
          .exec<{ lease_expires_at_ms: number }>(
            "SELECT lease_expires_at_ms FROM staging_session WHERE singleton = 1",
          )
          .toArray()[0]!;
        const mediaRow = state.storage.sql
          .exec<{ lease_expires_at_ms: number }>(
            "SELECT lease_expires_at_ms FROM staging_media WHERE media_asset_id = ?",
            media,
          )
          .toArray()[0]!;
        return {
          session: Number(row.lease_expires_at_ms),
          media: Number(mediaRow.lease_expires_at_ms),
        };
      });
    const initial = await readLease();
    const twoHours = 2 * 60 * 60 * 1_000;
    expect(initial.session - Date.now()).toBeGreaterThan(twoHours - 60_000);
    expect(initial.media - Date.now()).toBeGreaterThan(twoHours - 60_000);

    // Pretend ten minutes passed, then touch: the lease moves to now + 2 h.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = lease_expires_at_ms - 600000 WHERE singleton = 1",
      );
      state.storage.sql.exec(
        "UPDATE staging_media SET lease_expires_at_ms = lease_expires_at_ms - 600000",
      );
    });
    const sessionToken = await issueWorkerStagingSessionForTest(env, {
      ownerUserId: owner,
      stagingSessionId: session,
    });
    const touched = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/touch`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${sessionToken.capability}` },
        },
      ),
    );
    expect(touched.status).toBe(200);
    const afterTouch = await readLease();
    expect(afterTouch.session).toBeGreaterThan(initial.session - 600_000 + 500_000);
    expect(afterTouch.media).toBe(afterTouch.session);

    // Another owner cannot touch this session.
    const stranger = await issueWorkerStagingSessionForTest(env, {
      ownerUserId: crypto.randomUUID(),
      stagingSessionId: session,
    });
    const refused = await exports.default.fetch(
      new Request(
        `https://media-stage.over.garden/v1/staging/${session}/touch`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${stranger.capability}` },
        },
      ),
    );
    expect(refused.status).toBe(409);

    // With the lease still open the alarm keeps the object; once the lease
    // has passed with no touch, the alarm abandons the stage.
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = ? WHERE singleton = 1",
        Date.now() + 60_000,
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(1);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE staging_session SET lease_expires_at_ms = 0 WHERE singleton = 1",
      );
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await env.MEDIA_STAGING_BUCKET.list()).objects).toHaveLength(0);
    await expect(stub.redactedState()).resolves.toEqual(
      expect.objectContaining({ sessionState: "abandoned" }),
    );
  });

  it("rejects a delayed finalize completion after the session left publishing", async () => {
    const session = crypto.randomUUID();
    const publishId = crypto.randomUUID();
    const ownerSubjectHash = "A".repeat(43);
    const receiptSetDigest = "B".repeat(43);
    const stub = env.MEDIA_STAGING_SESSIONS.getByName(session);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        `INSERT INTO staging_session (
           singleton, owner_subject_hash, staging_session_id, state,
           publish_id, receipt_set_digest, lease_expires_at_ms,
           state_version, alarm_attempts, absent_readbacks, terminal_at_ms
         ) VALUES (1, ?, ?, 'abandoned', ?, ?, 0, 2, 0, 0, ?)`,
        ownerSubjectHash,
        session,
        publishId,
        receiptSetDigest,
        Date.now(),
      );
    });

    await expect(
      stub.completeFinalize({
        ownerSubjectHash,
        stagingSessionId: session,
        publishId,
        receiptSetDigest,
        nowMs: Date.now(),
        deadlineAtMs: Date.now() + 5_000,
      }),
    ).resolves.toEqual({
      status: "rejected",
      code: "session_not_publishing",
    });
    await expect(stub.redactedState()).resolves.toEqual(
      expect.objectContaining({ sessionState: "abandoned" }),
    );
  });
});

async function uploadForOwner(input: {
  owner: string;
  webp: Uint8Array;
  sha: string;
}) {
  const stagingSessionId = crypto.randomUUID();
  const mediaAssetId = crypto.randomUUID();
  const issued = await issueWorkerUploadCapabilityForTest(env, {
    ownerUserId: input.owner,
    stagingSessionId,
    mediaAssetId,
    generation: 1,
    sha256: input.sha,
    sizeBytes: input.webp.byteLength,
    width: 1,
    height: 1,
  });
  return exports.default.fetch(
    uploadRequest(
      `https://media-stage.over.garden/v1/staging/${stagingSessionId}/${mediaAssetId}/1`,
      issued.capability,
      input.webp,
      input.sha,
    ),
  );
}

async function stageForOwner(input: {
  owner: string;
  stagingSessionId: string;
  mediaAssetId: string;
  webp: Uint8Array;
}) {
  const sha = await sha256Base64(input.webp);
  const issued = await issueWorkerUploadCapabilityForTest(env, {
    ownerUserId: input.owner,
    stagingSessionId: input.stagingSessionId,
    mediaAssetId: input.mediaAssetId,
    generation: 1,
    sha256: sha,
    sizeBytes: input.webp.byteLength,
    width: 1,
    height: 1,
  });
  const response = await exports.default.fetch(
    uploadRequest(
      `https://media-stage.over.garden/v1/staging/${input.stagingSessionId}/${input.mediaAssetId}/1`,
      issued.capability,
      input.webp,
      sha,
    ),
  );
  const body = (await response.json()) as {
    stagingReceipt?: string;
  };
  expect(response.status, JSON.stringify(body)).toBe(201);
  expect(body.stagingReceipt).toEqual(expect.any(String));
  return {
    ...input,
    sha,
    stagingReceipt: body.stagingReceipt!,
  };
}

async function claimStagedSession(input: {
  owner: string;
  stagingSessionId: string;
  publishId: string;
  stagingReceipts: string[];
}) {
  const issued = await issueWorkerSessionCapabilityForTest(env, {
    ownerUserId: input.owner,
    stagingSessionId: input.stagingSessionId,
    publishId: input.publishId,
    stagingReceipts: input.stagingReceipts,
    purpose: "claim",
  });
  const response = await exports.default.fetch(
    new Request(
      `https://media-stage.over.garden/v1/staging/${input.stagingSessionId}/claim`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${issued.capability}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          publishId: input.publishId,
          stagingReceipts: input.stagingReceipts,
        }),
      },
    ),
  );
  const body = (await response.clone().json()) as {
    publicMedia?: Array<{ publicPath?: string }>;
  };
  return {
    response,
    publicPaths: body.publicMedia?.map((item) => item.publicPath ?? "") ?? [],
  };
}

function uploadRequest(
  url: string,
  capability: string,
  body: Uint8Array,
  sha256: string,
  dimensions: { width: number; height: number } = { width: 1, height: 1 },
) {
  return new Request(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${capability}`,
      "content-type": "image/webp",
      "content-length": String(body.byteLength),
      "content-sha256": sha256,
      "x-media-width": String(dimensions.width),
      "x-media-height": String(dimensions.height),
    },
    body: body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer,
  });
}

function decodeCapability(capability: string) {
  const encoded = capability.split(".", 1)[0]!;
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded)) as {
    nonce: string;
    ownerSubjectHash: string;
  };
}

async function sha256Base64(body: Uint8Array) {
  return btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", body)),
    ),
  );
}
