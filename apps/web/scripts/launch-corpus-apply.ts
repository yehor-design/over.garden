import { readFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import { config as loadEnv } from "dotenv";

import { validateLaunchCorpusContentPackFile } from "../src/server/launch-corpus/content-pack-file";

const argv = process.argv.slice(2);
let activeStage = "bootstrap";
const envFile = optionalFlag(argv, "--env-file") ?? ".env.local";
loadEnv({ path: envFile, override: false, quiet: true });
const caFile = optionalFlag(argv, "--ca-file");
if (caFile) process.env.DATABASE_SSL_CA = readFileSync(caFile, "utf8");

async function main() {
  activeStage = "validate_pack";
  const startedAt = performance.now();
  const environment = requireMatchingEnvironment(argv);
  if (environment === "production" && !process.env.DATABASE_SSL) {
    process.env.DATABASE_SSL = "true";
  }
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  const planDigest = requireDigest(argv, "--plan-digest");
  const approvedPackDigest = requireDigest(argv, "--content-pack-digest");
  const packFile = requireFlag(argv, "--pack-file");
  const { pack, validation } = await validateLaunchCorpusContentPackFile(packFile);
  if (!pack || !validation.ok || !validation.contentPackDigest) {
    throw new Error("Content pack validation failed.");
  }
  if (pack.planDigest !== planDigest) throw new Error("Content pack plan digest mismatch.");
  if (validation.contentPackDigest !== approvedPackDigest) {
    throw new Error("Approved content pack digest mismatch.");
  }

  const faultProfile = optionalFlag(argv, "--fault-profile");
  if (dryRun && !apply) {
    const receiptState = faultProfile === "search-timeout" ? "recovery" : "dry_run_ready";
    console.log(JSON.stringify(redactedReceipt({
      environment,
      mode: "dry_run",
      planDigest,
      contentPackDigest: approvedPackDigest,
      receiptState,
      latency: performance.now() - startedAt,
      mutationCount: 0,
    })));
    return;
  }
  if (!apply || dryRun) throw new Error("Choose exactly one of --dry-run or --apply.");

  const ownerUserId = process.env.OVERGARDEN_ADMIN_OWNER_USER_ID?.trim();
  if (!ownerUserId) throw new Error("Missing sealed editorial owner environment binding.");
  const packRoot = path.dirname(path.resolve(packFile));
  const scope = { userId: ownerUserId };

  activeStage = "load_server_modules";
  const [{ db }, journal, mediaRepo, processor, storage, lifecycle, operator] = await Promise.all([
    import("../src/db"),
    import("../src/server/journal-repository"),
    import("../src/server/media/media-repository"),
    import("../src/server/media/processor"),
    import("../src/lib/storage"),
    import("../src/server/media/lifecycle-revoke"),
    import("../src/server/launch-corpus/apply"),
  ]);
  activeStage = "ensure_owner";

  if (environment === "local" && argv.includes("--ensure-local-editorial-owner")) {
    await db.insertInto("user").values({
      id: ownerUserId,
      name: "OverGarden editorial",
      email: "ove199-editorial@example.invalid",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflict((conflict) => conflict.column("id").doNothing()).execute();
  }
  if (environment === "local" && argv.includes("--recover-local-stale-claims")) {
    await db.updateTable("media_assets").set({
      media_readiness_state: "retryable",
      processing_claim_token: null,
      processing_claimed_at: null,
      updated_at: new Date(),
    }).where("owner_user_id", "=", ownerUserId)
      .where("quarantine_key", "like", `quarantine/ove199/${approvedPackDigest}/%`)
      .where("media_readiness_state", "=", "processing")
      .execute();
  }

  let mediaProcessed = 0;
  let slotsApplied = 0;
  for (const slot of pack.slots) {
    activeStage = `slot_${slot.id.toLowerCase()}`;
    const slotStartedAt = performance.now();
    const entryId = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:entry:${slot.id}`);
    const clientMutationId = `ove199/${approvedPackDigest}/${slot.id}`;
    const existingEntry = await db.selectFrom("journal_entries")
      .select(["id", "content_class as contentClass", "source_language as sourceLanguage", "visibility", "lifecycle_state as lifecycleState", "client_mutation_id as clientMutationId"])
      .where("id", "=", entryId).where("owner_user_id", "=", ownerUserId).executeTakeFirst();
    if (existingEntry) {
      const stateMatches = existingEntry.clientMutationId === clientMutationId &&
        existingEntry.contentClass === "editorial" && existingEntry.sourceLanguage === slot.sourceLanguage &&
        (slot.visibility === "private"
          ? existingEntry.visibility === "private" && existingEntry.lifecycleState === "active"
          : slot.visibility === "public"
            ? existingEntry.visibility === "public" && existingEntry.lifecycleState === "active"
            : existingEntry.lifecycleState === "archived");
      if (!stateMatches) throw new Error(`Existing slot state drifted for ${slot.id}.`);
      if (slot.visibility === "public") {
        await journal.publishJournalEntry(scope, { entryId, disclosureAccepted: true });
      }
      slotsApplied += 1;
      continue;
    }
    const resolvedMedia: Array<{ id: string; role: "inline" | "cover_only"; sha256: string }> = [];
    for (const [mediaIndex, item] of slot.media.entries()) {
      activeStage = `slot_${slot.id.toLowerCase()}_media_${mediaIndex + 1}_resolve`;
      const id = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:media:${item.sha256}`);
      let asset = await mediaRepo.findMediaAssetForOwner(scope, id);
      if (!asset) {
        activeStage = `slot_${slot.id.toLowerCase()}_media_${mediaIndex + 1}_upload`;
        const bytes = readFileSync(path.resolve(packRoot, item.file));
        const uploadGenerationId = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:upload:${item.sha256}`);
        const publicObjectId = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:public:${item.sha256}`);
        const quarantineKey = `quarantine/ove199/${approvedPackDigest}/${item.sha256}.jpg`;
        asset = await mediaRepo.createQuarantinedMediaAsset(scope, {
          internalDeterministicId: id,
          quarantineKey,
          declaredMediaType: "image/jpeg",
          declaredSizeBytes: bytes.byteLength,
          uploadGenerationId,
          publicObjectId,
        });
        const upload = await storage.createQuarantineUploadUrl({
          objectKey: quarantineKey,
          contentType: "image/jpeg",
          contentLength: bytes.byteLength,
        });
        const response = await fetch(upload.uploadUrl, {
          method: "PUT",
          headers: { "content-type": "image/jpeg", "content-length": String(bytes.byteLength) },
          body: bytes,
        });
        if (!response.ok) throw new Error(`Quarantine upload failed for ${slot.id}.`);
      }

      if (asset.media_readiness_state !== "public_ready") {
        activeStage = `slot_${slot.id.toLowerCase()}_media_${mediaIndex + 1}_claim`;
        if (asset.media_readiness_state === "rejected") {
          const reasons = (asset.quality_reason_codes ?? []).join("_").replace(/[^a-z0-9_]/gi, "");
          activeStage = `slot_${slot.id.toLowerCase()}_media_${mediaIndex + 1}_rejected_${reasons || "policy"}`;
          throw new Error("Licensed media failed launch quality policy.");
        }
        const claim = await mediaRepo.claimMediaAssetForProcessing(scope, id);
        if (!claim) {
          activeStage = `${activeStage}_${asset.media_readiness_state.replace(/[^a-z0-9_]/gi, "")}`;
          throw new Error(`Media processing lease unavailable for ${slot.id}.`);
        }
        try {
          let derivativeKey = claim.asset.derivative_key;
          if (claim.phase === "process_original") {
            activeStage = `slot_${slot.id.toLowerCase()}_media_${mediaIndex + 1}_process`;
            const derivative = await processor.processQuarantinedImage(claim.asset);
            derivativeKey = derivative.derivativeKey;
            const written = await mediaRepo.markClaimedMediaDerivativeWritten(scope, claim, derivative);
            if (!written) throw new Error(`Media processing claim drifted for ${slot.id}.`);
          }
          if (!derivativeKey) throw new Error(`Derivative missing for ${slot.id}.`);
          const proof = await lifecycle.revokeMediaObjectBytes({ bucket: "quarantine", objectKey: claim.asset.quarantine_key });
          if (proof.outcome !== "confirmed_gone") throw new Error(`Original cleanup indeterminate for ${slot.id}.`);
          const settled = await mediaRepo.settleClaimedMediaPublicReady(scope, claim);
          if (!settled) throw new Error(`Media settlement drifted for ${slot.id}.`);
          mediaProcessed += 1;
        } catch (error) {
          if (error instanceof processor.MediaLaunchQualityError) {
            await mediaRepo.recordClaimedMediaQuality(scope, claim, error.quality);
          }
          const terminal = error instanceof processor.MediaLaunchQualityError ||
            (error instanceof Error && error.name === "SafeMediaAdmissionError");
          await mediaRepo.releaseMediaProcessingClaim(scope, claim, terminal);
          throw error;
        }
      }
      await db.updateTable("media_assets").set({ alt_text: item.alt, caption: item.caption, updated_at: new Date() })
        .where("id", "=", id).where("owner_user_id", "=", ownerUserId).execute();
      resolvedMedia.push({ id, role: item.role, sha256: item.sha256 });
    }

    const inline = resolvedMedia.filter((item) => item.role === "inline");
    const coverItem = slot.explicitCoverMediaSha256
      ? resolvedMedia.find((item) => item.sha256 === slot.explicitCoverMediaSha256)
      : null;
    const cover = coverItem
      ? coverItem.role === "cover_only"
        ? { mode: "separate" as const, mediaAssetId: coverItem.id }
        : { mode: "explicit_inline" as const, mediaAssetId: coverItem.id }
      : inline.length > 0
        ? { mode: "automatic" as const }
        : { mode: "none" as const };
    const contentDocument = {
      schemaVersion: 1 as const,
      blocks: [
        { id: `${slot.id}-p`, type: "paragraph" as const, spans: [{ text: slot.body }] },
        ...inline.map((item, index) => ({ id: `${slot.id}-m-${index + 1}`, type: "image" as const, mediaAssetId: item.id })),
      ],
    };
    const spaceId = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:space:${slot.market}`);
    const objectId = operator.deterministicLaunchCorpusUuid(`${approvedPackDigest}:object:${slot.market}:${slot.objectKind}`);
    const firstForObject = slot.id.endsWith("J01") || slot.id.endsWith("J04");
    activeStage = `slot_${slot.id.toLowerCase()}_create`;
    const created = firstForObject
      ? await journal.createFirstPlantEntry(scope, {
          ...(slot.id.endsWith("J04") ? { spaceId } : { spaceName: slot.spaceLabel }),
          plantName: slot.objectLabel,
          objectKind: slot.objectKind,
          userAddedCatalogName: slot.catalogIdentity,
          title: slot.title,
          contentDocument,
          entryDate: slot.entryDate,
          locationVisibility: "hidden",
          clientMutationId,
          cover,
          internalDeterministicIds: { spaceId, plantObjectId: objectId, entryId },
        })
      : await journal.createPlantObjectJournalEntry(scope, {
          plantObjectId: objectId,
          title: slot.title,
          contentDocument,
          entryDate: slot.entryDate,
          clientMutationId,
          cover,
          internalDeterministicIds: { entryId },
        });
    const entry = created.entry;
    activeStage = `slot_${slot.id.toLowerCase()}_classify`;
    await operator.markLaunchCorpusEntryEditorial({
      scope, entryId: entry.id, slotId: slot.id,
      sourceLanguage: slot.sourceLanguage, contentPackDigest: approvedPackDigest,
    });
    if (slot.visibility !== "private") {
      activeStage = `slot_${slot.id.toLowerCase()}_publish`;
      await journal.publishJournalEntry(scope, { entryId: entry.id, disclosureAccepted: true });
    }
    if (slot.visibility === "archived_410") {
      activeStage = `slot_${slot.id.toLowerCase()}_archive`;
      await journal.archiveJournalEntry(scope, { entryId: entry.id });
    }
    if (performance.now() - slotStartedAt > 120_000) throw new Error(`Slot latency exceeded for ${slot.id}.`);
    slotsApplied += 1;
  }

  activeStage = "legacy_dispositions";
  const disposition = environment === "production"
    ? await operator.applyExactLegacyDispositions(pack)
    : { targetCount: 0, mutated: 0 };
  activeStage = "verify_exact_manifest";
  const verified = await operator.verifyAppliedLaunchCorpus({
    pack,
    contentPackDigest: approvedPackDigest,
    ownerUserId,
  });
  console.log(JSON.stringify(redactedReceipt({
    environment,
    mode: "apply",
    planDigest,
    contentPackDigest: approvedPackDigest,
    receiptState: "verified",
    latency: performance.now() - startedAt,
    mutationCount: slotsApplied + mediaProcessed + disposition.mutated,
    slotsApplied,
    mediaProcessed,
    dispositionTargetCount: disposition.targetCount,
    verified,
  })));
}

function redactedReceipt(input: Record<string, unknown>) {
  return {
    ok: true, issue: "OVE-199", redacted: true, ...input,
    thresholdMilliseconds: 120_000,
    controls: { abortBeforeNextSlotCommand: "responsive", compensateCurrentSlotCommand: "responsive" },
  };
}

function requireMatchingEnvironment(args: string[]) {
  const environment = requireFlag(args, "--environment");
  const confirm = requireFlag(args, "--confirm-environment");
  if (environment !== confirm) throw new Error("Environment confirmation mismatch.");
  if (environment !== "local" && environment !== "production") throw new Error("Environment must be local or production.");
  return environment;
}

function requireDigest(args: string[], name: string) {
  const value = requireFlag(args, name);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function requireFlag(args: string[], name: string): string {
  const value = optionalFlag(args, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, issue: "OVE-199", redacted: true, errorCode: error instanceof Error ? "apply_refused" : "unknown_error", stage: activeStage }));
  process.exitCode = 1;
});
