/**
 * OVE-323 redacted runtime-absence proof.
 *
 * Browser semantics live in the Playwright matrix. This companion smoke binds
 * the checked-out source/package inventory, optional production build output,
 * and served HTTP surface without reading identity or journal content.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { runOnlineOnlyCanonCheck } from "./check-online-only-canon";

const RETIRED_PATHS = [
  "public/icon-192.png",
  "public/icon-512.png",
  "public/sw.js",
  "public/sw.test.ts",
  "scripts/smoke-legacy-device-retirement.ts",
  "scripts/smoke-session-convergence.ts",
  "src/app/%5F%5Fvisual-fixtures/account-sign-out",
  "src/app/%5F%5Fvisual-fixtures/foreground-autosync",
  "src/app/%5F%5Fvisual-fixtures/legacy-device-retirement",
  "src/app/%5F%5Fvisual-fixtures/owner-vault",
  "src/app/%5F%5Fvisual-fixtures/session-recheck",
  "src/app/%5F%5Fvisual-fixtures/visual-intent-draft-trigger.test.ts",
  "src/app/%5F%5Fvisual-fixtures/visual-intent-draft-trigger.tsx",
  "src/app/api/offline",
  "src/app/erasure/erasure-local-cleanup.test.tsx",
  "src/app/erasure/erasure-local-cleanup.tsx",
  "src/app/manifest.ts",
  "src/app/sw-register.tsx",
  "src/components/auth/foreground-autosync-provider.test.tsx",
  "src/components/auth/foreground-autosync-provider.tsx",
  "src/lib/legacy-device-work",
  "src/lib/offline",
  "src/server/offline-owner-vault-binding.test.ts",
  "src/server/offline-owner-vault-binding.ts",
  "tests/account-sign-out.spec.ts",
  "tests/legacy-device-retirement.spec.ts",
  "tests/session-convergence.spec.ts",
] as const;

const RETIRED_BUILD_MARKERS = [
  "fake-indexeddb",
  "journal-entry-sync",
  "owner-vault-migration",
  "foreground-autosync",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredBaseUrl() {
  const url = new URL(flagValue("--base-url") ?? "http://127.0.0.1:3000");
  const loopback = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"];
  assert(
    url.protocol === "https:" || loopback.includes(url.hostname.toLowerCase()),
    "OVE-323 smoke accepts only HTTPS or a loopback HTTP origin.",
  );
  return url.origin;
}

async function main() {
  const baseUrl = requiredBaseUrl();
  const requireBuildOutput = process.argv.includes("--require-build-output");

  for (const relativePath of RETIRED_PATHS) {
    assert(!(await exists(relativePath)), `${relativePath} is still present.`);
  }

  const [packageText, lockText, setupText] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("pnpm-lock.yaml", "utf8"),
    readFile("test/setup.ts", "utf8"),
  ]);
  const packageJson = JSON.parse(packageText) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const installedNames = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.devDependencies ?? {}),
  ]);
  assert(!installedNames.has("dexie"), "dexie remains a direct dependency.");
  assert(
    !installedNames.has("fake-indexeddb"),
    "fake-indexeddb remains a direct dependency.",
  );
  assert(
    !/(?:^|\n)\s{2}(?:dexie|fake-indexeddb)@/u.test(lockText),
    "The lockfile still contains a retired browser database package.",
  );
  assert(
    !/fake-indexeddb|dexie/iu.test(setupText),
    "The test bootstrap still installs a retired database runtime.",
  );

  const canon = runOnlineOnlyCanonCheck({ allowDirty: true });
  assert(canon.status === "aligned", "Online-only canon is not aligned.");

  const chunksRoot = path.resolve(".next/static/chunks");
  const buildOutputPresent = await exists(chunksRoot);
  assert(
    buildOutputPresent || !requireBuildOutput,
    "A fresh production build is required for this absence proof.",
  );
  let checkedChunkCount = 0;
  if (buildOutputPresent) {
    const chunkPaths = await listFiles(chunksRoot);
    for (const chunkPath of chunkPaths.filter((value) =>
      /\.js$/u.test(value),
    )) {
      checkedChunkCount += 1;
      const source = await readFile(chunkPath, "utf8");
      for (const marker of RETIRED_BUILD_MARKERS) {
        assert(
          !source.toLowerCase().includes(marker),
          `Production build output still contains ${marker}.`,
        );
      }
    }
  }

  const [home, manifest, worker, icon192, icon512] = await Promise.all([
    fetch(new URL("/", baseUrl), { redirect: "follow" }),
    fetch(new URL("/manifest.webmanifest", baseUrl), { redirect: "manual" }),
    fetch(new URL("/sw.js", baseUrl), { redirect: "manual" }),
    fetch(new URL("/icon-192.png", baseUrl), { redirect: "manual" }),
    fetch(new URL("/icon-512.png", baseUrl), { redirect: "manual" }),
  ]);
  assert(home.status === 200, "Public application boot did not return 200.");
  assert(
    new URL(home.url).origin === baseUrl,
    "Public application boot redirected outside the expected origin.",
  );
  const homeHtml = await home.text();
  assert(
    !/<link\b[^>]*\brel=["']manifest["']/iu.test(homeHtml),
    "The served document still advertises a web manifest.",
  );
  for (const [label, response] of [
    ["manifest", manifest],
    ["worker", worker],
    ["icon192", icon192],
    ["icon512", icon512],
  ] as const) {
    assert(response.status === 404, `${label} did not return exact 404.`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        issue: "OVE-323",
        evidenceClass: "redacted_offline_runtime_absence",
        retiredPathCount: RETIRED_PATHS.length,
        directRetiredDependencyCount: 0,
        buildOutputChecked: buildOutputPresent,
        checkedChunkCount,
        manifestAdvertised: false,
        retiredAssetStatusClass: "exact_404",
        canonDigest: canon.digest,
        evidenceSafety: "counts_booleans_status_classes_and_digest_only",
      },
      null,
      2,
    )}\n`,
  );
}

async function exists(relativePath: string) {
  try {
    await stat(path.resolve(relativePath));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(root, entry.name);
      return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
    }),
  );
  return nested.flat().sort();
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      issue: "OVE-323",
      error: "offline_runtime_absence_smoke_failed",
      message: error instanceof Error ? error.message : "unknown",
      evidenceSafety: "no_identity_content_or_provider_key",
    })}\n`,
  );
  process.exitCode = 1;
});
