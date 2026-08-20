/**
 * OVE-325 redacted loopback smoke.
 *
 * The Playwright matrix owns authenticated mutation evidence. This companion
 * smoke proves that the checked-out four-caller inventory, legacy import fence,
 * canonical route denial, and public boot all agree with that browser proof.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { runOnlineOnlyCanonCheck } from "./check-online-only-canon";

const COMPOSERS = [
  {
    kind: "first_entry",
    path: "src/app/garden/first-entry-composer.tsx",
  },
  {
    kind: "space_entry",
    path: "src/app/garden/space-entry-composer.tsx",
  },
  {
    kind: "follow_up",
    path: "src/app/garden/objects/[objectId]/follow-up-entry-composer.tsx",
  },
  {
    kind: "edit_entry",
    path: "src/app/garden/entries/[entryId]/edit/journal-entry-edit-composer.tsx",
  },
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredLoopbackBaseUrl() {
  const raw = flagValue("--base-url") ?? "http://127.0.0.1:3000";
  const url = new URL(raw);
  assert(
    ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"].includes(
      url.hostname.toLowerCase(),
    ),
    "OVE-325 smoke refuses a non-loopback base URL.",
  );
  return url.origin;
}

async function main() {
  const baseUrl = requiredLoopbackBaseUrl();
  const sources = await Promise.all(
    COMPOSERS.map(async (composer) => ({
      ...composer,
      source: await readFile(path.resolve(composer.path), "utf8"),
    })),
  );
  for (const composer of sources) {
    assert(
      composer.source.includes("useOnlineJournalComposer"),
      `${composer.kind} does not use the online draft owner.`,
    );
    assert(
      composer.source.includes(
        `data-online-composer-kind=\"${composer.kind}\"`,
      ),
      `${composer.kind} browser receipt marker is absent.`,
    );
    assert(
      !/(?:navigator\.onLine|addEventListener\(["'](?:online|offline)["'])/u.test(
        composer.source,
      ),
      `${composer.kind} still uses browser connectivity authority.`,
    );
  }

  const canon = runOnlineOnlyCanonCheck({ allowDirty: true });
  assert(canon.status === "aligned", "Online-only canon is not aligned.");

  const [garden, unauthenticatedDraft] = await Promise.all([
    fetch(new URL("/garden", baseUrl), {
      redirect: "manual",
      headers: { Accept: "text/html" },
    }),
    fetch(new URL("/api/garden/drafts/first-entry", baseUrl), {
      redirect: "manual",
      headers: { Accept: "application/json" },
    }),
  ]);
  assert(garden.status === 200, "Public garden boot did not return 200.");
  assert(
    [401, 403].includes(unauthenticatedDraft.status),
    "Unauthenticated draft request did not fail closed.",
  );
  const cacheControl = unauthenticatedDraft.headers.get("cache-control") ?? "";
  assert(
    cacheControl.includes("private") && cacheControl.includes("no-store"),
    "Draft denial omitted private no-store headers.",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        issue: "OVE-325",
        evidenceClass: "redacted_loopback_online_composer_cutover",
        composerKinds: COMPOSERS.map((composer) => composer.kind),
        requestResultAuthority: true,
        unauthenticatedDraftDenied: true,
        privateNoStore: true,
        legacyWriterFence: canon.violations.length === 0,
        canonDigest: canon.digest,
        evidenceSafety: "counts_booleans_and_digest_only",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      issue: "OVE-325",
      error: "online_composer_cutover_smoke_failed",
      message: error instanceof Error ? error.message : "unknown",
      evidenceSafety: "no_identity_content_or_provider_key",
    })}\n`,
  );
  process.exitCode = 1;
});
