import { randomUUID } from "node:crypto";

import { config as loadEnv } from "dotenv";
import sharp from "sharp";

loadEnv({ path: ".env.local" });

const PLAN_DIGEST =
  "3585dce4442abdb93c108ef9908586a30888c7c0f3ba84097606d52f3c743a18";

function requireEnvironment(argv: string[]) {
  const environment = readFlag(argv, "--environment");
  const confirm = readFlag(argv, "--confirm-environment");
  if (!environment || environment !== confirm) {
    throw new Error("Refuse to run without matching environment confirmation.");
  }
  if (environment !== "local" && environment !== "production") {
    throw new Error("Environment must be local or production.");
  }
  if (
    environment === "production" &&
    readFlag(argv, "--plan-digest") !== PLAN_DIGEST
  ) {
    throw new Error("Production requires the approved OVE-244 plan digest.");
  }
  return environment;
}

function readFlag(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
}

async function main() {
  const environment = requireEnvironment(process.argv.slice(2));
  const [
    { db },
    { createQuarantineUploadUrl },
    {
      claimMediaAssetForProcessing,
      createQuarantinedMediaAsset,
      getMediaAssetForOwner,
      markClaimedMediaDerivativeWritten,
      releaseMediaProcessingClaim,
      settleClaimedMediaPublicReady,
    },
    { processQuarantinedImage },
    { revokeMediaObjectBytes },
  ] = await Promise.all([
    import("@/db"),
    import("@/lib/storage"),
    import("@/server/media/media-repository"),
    import("@/server/media/processor"),
    import("@/server/media/lifecycle-revoke"),
  ]);
  const startedAt = performance.now();
  const ownerUserId = randomUUID();
  const uploadGenerationId = randomUUID();
  const publicObjectId = randomUUID();
  const quarantineKey = `quarantine/${uploadGenerationId}.png`;
  const scope = { userId: ownerUserId, sessionId: "synthetic-proof" };
  const bytes = await sharp({
    create: { width: 128, height: 96, channels: 3, background: "#4f772d" },
  })
    .png()
    .toBuffer();
  let mediaAssetId: string | null = null;
  let derivativeKey: string | null = null;
  const attemptedDerivativeKeys = new Set<string>();

  try {
    const asset = await createQuarantinedMediaAsset(scope, {
      quarantineKey,
      declaredMediaType: "image/png",
      declaredSizeBytes: bytes.byteLength,
      uploadGenerationId,
      publicObjectId,
    });
    mediaAssetId = asset.id;
    const upload = await createQuarantineUploadUrl({
      objectKey: quarantineKey,
      contentType: "image/png",
      contentLength: bytes.byteLength,
    });
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
      signal: AbortSignal.timeout(5_000),
    });
    if (!put.ok) throw new Error("Synthetic upload was rejected.");

    const [first, second] = await Promise.all([
      claimMediaAssetForProcessing(scope, asset.id),
      claimMediaAssetForProcessing(scope, asset.id),
    ]);
    const claims = [first, second].filter((value) => value !== null);
    if (claims.length !== 1)
      throw new Error("Processing CAS did not produce one winner.");
    const claim = claims[0]!;
    if (claim.phase !== "process_original") {
      throw new Error("Fresh generation entered the wrong processing phase.");
    }
    if (claim.asset.public_object_id === asset.public_object_id) {
      throw new Error("Fresh claim did not rotate its provider identity.");
    }
    const claimedDerivativeKey = `derivatives/${claim.asset.public_object_id}.webp`;
    attemptedDerivativeKeys.add(claimedDerivativeKey);
    const cleanupIntent = await db
      .selectFrom("job_queue")
      .select("id")
      .where(
        "idempotency_key",
        "=",
        `media_derivative_revoke:public_derivative:${claimedDerivativeKey}`,
      )
      .where("status", "=", "pending")
      .executeTakeFirst();
    if (!cleanupIntent) {
      throw new Error(
        "Provider write was not preceded by durable cleanup intent.",
      );
    }
    const staleSettlement = await markClaimedMediaDerivativeWritten(
      scope,
      {
        asset,
        claimToken: randomUUID(),
        phase: "process_original",
      },
      {
        derivativeKey: `derivatives/${asset.public_object_id}.webp`,
        admittedMediaType: "image/png",
        intrinsicWidth: 128,
        intrinsicHeight: 96,
      },
    );
    if (staleSettlement) {
      throw new Error("Superseded provider identity settled canonical state.");
    }
    const derivative = await processQuarantinedImage(claim.asset);
    derivativeKey = derivative.derivativeKey;
    const written = await markClaimedMediaDerivativeWritten(
      scope,
      claim,
      derivative,
    );
    if (!written) throw new Error("Claim lost before derivative settlement.");
    await releaseMediaProcessingClaim(scope, claim, false);
    const recoveryClaim = await claimMediaAssetForProcessing(scope, asset.id);
    if (
      !recoveryClaim ||
      recoveryClaim.phase !== "prove_original_absence" ||
      recoveryClaim.asset.public_object_id !== claim.asset.public_object_id ||
      recoveryClaim.asset.derivative_key !== derivative.derivativeKey
    ) {
      throw new Error(
        "Derivative-written recovery did not preserve the winner.",
      );
    }
    const originalProof = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: quarantineKey,
    });
    if (originalProof.outcome !== "confirmed_gone") {
      throw new Error("Original absence was not authoritative.");
    }
    const ready = await settleClaimedMediaPublicReady(scope, recoveryClaim);
    if (!ready) throw new Error("Claim lost before public-ready settlement.");
    const settledCleanupIntent = await db
      .selectFrom("job_queue")
      .select("id")
      .where(
        "idempotency_key",
        "=",
        `media_derivative_revoke:public_derivative:${derivative.derivativeKey}`,
      )
      .executeTakeFirst();
    if (settledCleanupIntent) {
      throw new Error("Public-ready settlement retained its cleanup intent.");
    }

    const replay = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(bytes.byteLength),
      },
      body: bytes,
      signal: AbortSignal.timeout(5_000),
    });
    if (!replay.ok) throw new Error("Stale replay could not be classified.");
    const afterReplay = await getMediaAssetForOwner(scope, asset.id);
    if (
      afterReplay.media_readiness_state !== "public_ready" ||
      afterReplay.upload_generation_id !== uploadGenerationId
    )
      throw new Error("Stale replay changed current generation state.");
    const replayCleanup = await revokeMediaObjectBytes({
      bucket: "quarantine",
      objectKey: quarantineKey,
    });
    if (replayCleanup.outcome !== "confirmed_gone") {
      throw new Error("Stale replay residue was not removed.");
    }

    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs > 30_000)
      throw new Error("Safe media processing exceeded its budget.");
    console.log(
      JSON.stringify({
        ok: true,
        environment,
        planDigest: PLAN_DIGEST,
        claimWinners: 1,
        staleClaimant: "fenced",
        recoveryPhase: "proof_only",
        state: "public_ready",
        originalProof: "confirmed_gone",
        staleReplay: "non_current",
        safeMediaProcessingLatencyMs: durationMs,
      }),
    );
  } finally {
    const cleanupErrors: string[] = [];
    try {
      if (mediaAssetId) {
        await db
          .updateTable("media_assets")
          .set({
            media_readiness_state: "invalidated",
            updated_at: new Date(),
          })
          .where("id", "=", mediaAssetId)
          .execute();
      }
    } catch {
      cleanupErrors.push("database invalidation");
    }
    try {
      if (derivativeKey) {
        const proof = await revokeMediaObjectBytes({
          bucket: "public_derivative",
          objectKey: derivativeKey,
        });
        if (proof.outcome !== "confirmed_gone")
          cleanupErrors.push("derivative removal");
      }
    } catch {
      cleanupErrors.push("derivative removal");
    }
    try {
      const proof = await revokeMediaObjectBytes({
        bucket: "quarantine",
        objectKey: quarantineKey,
      });
      if (proof.outcome !== "confirmed_gone")
        cleanupErrors.push("quarantine removal");
    } catch {
      cleanupErrors.push("quarantine removal");
    }
    try {
      if (mediaAssetId) {
        await db
          .deleteFrom("media_assets")
          .where("id", "=", mediaAssetId)
          .execute();
      }
    } catch {
      cleanupErrors.push("database row removal");
    }
    try {
      for (const key of attemptedDerivativeKeys) {
        await db
          .deleteFrom("job_queue")
          .where(
            "idempotency_key",
            "=",
            `media_derivative_revoke:public_derivative:${key}`,
          )
          .where("status", "in", ["pending", "failed", "done", "dead"])
          .execute();
      }
    } catch {
      cleanupErrors.push("cleanup intent removal");
    }
    await db.destroy();
    if (cleanupErrors.length > 0) {
      throw new Error(
        `Synthetic cleanup failed: ${[...new Set(cleanupErrors)].join(", ")}.`,
      );
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Safe media smoke failed.",
  );
  process.exitCode = 1;
});
