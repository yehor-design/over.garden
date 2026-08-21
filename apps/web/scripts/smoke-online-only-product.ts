/**
 * OVE-326 content-free live receipt for the final online-only surface.
 * Real browser storage and network-down behavior is owned by the Playwright
 * matrix; this smoke binds the exact source/build classification to served
 * locale and retired-asset status classes.
 */
import { execFileSync } from "node:child_process";

import { runOnlineOnlyRetirementVerification } from "./verify-online-only-retirement";

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

function flagValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredBaseUrl() {
  const url = new URL(flagValue("--base-url") ?? "http://127.0.0.1:3000");
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname.toLowerCase()))
  ) {
    throw new Error("OVE-326 smoke accepts only HTTPS or loopback HTTP.");
  }
  return url.origin;
}

function implementationSha() {
  const expected = flagValue("--expected-sha")?.trim().toLowerCase();
  const actual = (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5_000,
    })
  )
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(actual)) {
    throw new Error("The implementation SHA is unavailable.");
  }
  if (expected !== undefined && expected !== actual) {
    throw new Error("The checked implementation SHA differs from --expected-sha.");
  }
  return actual;
}

async function main() {
  const baseUrl = requiredBaseUrl();
  const requireBuildOutput = process.argv.includes("--require-build-output");
  const sourceReceipt = await runOnlineOnlyRetirementVerification({
    requireBuildOutput,
    proveDeterminism: true,
  });
  if (sourceReceipt.resultClass !== "aligned") {
    throw new Error("The classified online-only source receipt is not aligned.");
  }

  const localeStatuses: Array<{ locale: string; status: number }> = [];
  for (const locale of ["uk", "bg", "ru"] as const) {
    const response = await fetch(new URL("/", baseUrl), {
      redirect: "follow",
      headers: {
        Cookie: [
          `overgarden_interface_locale=${locale}`,
          `overgarden_interface_market=${locale === "uk" ? "ukraine" : "bulgaria"}`,
        ].join("; "),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200 || new URL(response.url).origin !== baseUrl) {
      throw new Error(`The ${locale} public read is not a same-origin 200.`);
    }
    const html = await response.text();
    if (/<link\b[^>]*\brel=["']manifest["']/iu.test(html)) {
      throw new Error(`The ${locale} document advertises a retired manifest.`);
    }
    localeStatuses.push({ locale, status: response.status });
  }

  const retiredAssetStatuses: Array<{ path: string; status: number }> = [];
  for (const pathname of [
    "/manifest.webmanifest",
    "/sw.js",
    "/icon-192.png",
    "/icon-512.png",
  ]) {
    const response = await fetch(new URL(pathname, baseUrl), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 404) {
      throw new Error(`${pathname} did not return exact 404.`);
    }
    retiredAssetStatuses.push({ path: pathname, status: response.status });
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      issue: "OVE-326",
      evidenceClass: "redacted_online_only_product",
      implementationSha: implementationSha(),
      baseUrlClass: new URL(baseUrl).protocol === "https:" ? "https" : "loopback",
      localeStatuses,
      retiredAssetStatuses,
      manifestAdvertised: false,
      sourceDigest: sourceReceipt.digest,
      activeViolationCount: sourceReceipt.activeViolationCount,
      buildOutputChecked: sourceReceipt.buildOutputChecked,
      checkedChunkCount: sourceReceipt.checkedChunkCount,
      evidenceSafety: "counts_booleans_status_classes_paths_and_digests_only",
    })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      ok: false,
      issue: "OVE-326",
      error: "online_only_product_smoke_failed",
      message: error instanceof Error ? error.message : "unknown",
      evidenceSafety: "no_identity_content_or_secret",
    })}\n`,
  );
  process.exitCode = 1;
});
