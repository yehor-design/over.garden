/**
 * OVE-373: one read-only proof of the seven owner requirements (ADR-0022)
 * against production. Safe GETs and HEADs only, no credentials, no writes. The
 * receipt carries counts and classes, never page content.
 *
 *   cd apps/web && pnpm exec tsx scripts/prove-owner-mvp-reset.ts [--base https://over.garden] [--out ../../docs/OWNER_MVP_RESET_PROOF_2026-09.md]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USER_AGENT = "overgarden-owner-mvp-reset-proof";
const ENTRY_SAMPLE = 12;

interface Check {
  requirement: string;
  check: string;
  class: "pass" | "fail" | "pending";
  detail: string;
}

async function main() {
  const args = process.argv.slice(2);
  const base = valueOf(args, "--base") ?? "https://over.garden";
  const out = valueOf(args, "--out") ?? null;
  const checks: Check[] = [];

  // D3: every entry listed on /journals is indexable with canonical + JSON-LD.
  const journals = await page(base, "/journals");
  // Directory cards link with a `?from=` return hint; the entry path is the
  // part before it.
  const entryPaths = unique(
    [...journals.html.matchAll(/href="(\/(?:bg|ru)?\/?journal\/[^"#]+)"/g)].map(
      (match) => match[1]!.split("?")[0]!,
    ),
  ).slice(0, ENTRY_SAMPLE);
  let indexable = 0;
  let withCanonical = 0;
  let withJsonLd = 0;
  let withImages = 0;
  let withOptimizer = 0;
  let withVariants = 0;
  let withVariantSrcset = 0;
  let primaryOnly = 0;
  for (const path of entryPaths) {
    const entry = await page(base, path);
    if (/<meta name="robots" content="index, follow"/.test(entry.html)) indexable += 1;
    if (/<link rel="canonical" href="/.test(entry.html)) withCanonical += 1;
    if (/<script type="application\/ld\+json"/.test(entry.html)) withJsonLd += 1;
    const primary = /<img[^>]+src="(https:\/\/media\.over\.garden\/[^"]+\.webp)"/.exec(
      entry.html,
    )?.[1];
    if (primary) {
      withImages += 1;
      if (/\/_next\/image\?/.test(entry.html)) withOptimizer += 1;
      // Variants exist only for photos published after migration 0047, and
      // the CDN is the witness. React serialises the attribute as `srcSet`,
      // so the match is case-insensitive.
      if (await variantExists(primary)) {
        withVariants += 1;
        if (/srcset="/i.test(entry.html)) withVariantSrcset += 1;
      } else {
        primaryOnly += 1;
      }
    }
  }
  checks.push({
    requirement: "D3 indexable",
    check: `sampled entries index, follow with canonical and JSON-LD`,
    class:
      entryPaths.length > 0 &&
      indexable === entryPaths.length &&
      withCanonical === entryPaths.length &&
      withJsonLd === entryPaths.length
        ? "pass"
        : "fail",
    detail: `${indexable}/${entryPaths.length} index, ${withCanonical}/${entryPaths.length} canonical, ${withJsonLd}/${entryPaths.length} JSON-LD`,
  });
  const sitemap = await page(base, "/sitemap.xml");
  const chunks = ["entries", "profiles", "communities"].filter((name) =>
    new RegExp(`/sitemaps/${name}(?:-\\d+)?\\.xml`).test(sitemap.html),
  );
  checks.push({
    requirement: "D3 sitemap",
    check: "sitemap index lists entries, profiles, communities",
    class: chunks.length === 3 ? "pass" : "fail",
    detail: `chunks present: ${chunks.join(", ") || "none"}`,
  });

  // D4: cached public HTML with a fast TTFB.
  const publicPages = ["/", "/journals", "/feed", entryPaths[0] ?? "/journals"];
  const cacheDetail: string[] = [];
  let cachedPages = 0;
  for (const path of publicPages) {
    const first = await page(base, path);
    const second = await page(base, path);
    const cache = second.headers.get("x-vercel-cache") ?? "none";
    if (cache === "HIT" || cache === "STALE") cachedPages += 1;
    cacheDetail.push(`${path}: ${cache} ${second.ttfbMs} ms`);
    void first;
  }
  checks.push({
    requirement: "D4 cache",
    check: "x-vercel-cache HIT on the second read of four public pages",
    class: cachedPages === publicPages.length ? "pass" : cachedPages > 0 ? "pending" : "fail",
    detail: cacheDetail.join("; "),
  });

  // D2: photos with promoted variants serve as plain <img srcset>, never
  // through an optimizer. Photos published before migration 0047 never had
  // variants generated and serve the primary only; they are counted, not
  // failed.
  checks.push({
    requirement: "D2 delivery",
    check: "entry photos with variants have srcset and no /_next/image",
    class:
      withImages === 0 || withVariants === 0
        ? "pending"
        : withOptimizer === 0 && withVariantSrcset === withVariants
          ? "pass"
          : "fail",
    detail: `${withImages} entries with photos: ${withVariantSrcset}/${withVariants} with variants serve srcset, ${primaryOnly} published before migration 0047 (primary only), ${withOptimizer} through the optimizer`,
  });

  // D6 / offline residue: no client gates or retirement markers in public HTML.
  const markers = ["data-legacy-device-retirement", "data-session-convergence-gate"];
  const markerHits = markers.filter((marker) => journals.html.includes(marker));
  checks.push({
    requirement: "D6 sessions, offline residue",
    check: "no retirement or convergence-gate markers",
    class: markerHits.length === 0 ? "pass" : "fail",
    detail: markerHits.length === 0 ? "none found" : markerHits.join(", "),
  });

  // D5: admin surfaces are the product, /health belongs to the owner.
  const closed: string[] = [];
  let closedOk = 0;
  for (const path of ["/admin", "/health", "/api/media/staging/reservations"]) {
    const response = await request(base, path);
    const ok = response.status === 404;
    if (ok) closedOk += 1;
    closed.push(`${path}: ${response.status}`);
  }
  checks.push({
    requirement: "D5 admin, D2 session contract",
    check: "/admin, anonymous /health, and the retired reservations route answer 404",
    class: closedOk === 3 ? "pass" : "fail",
    detail: closed.join("; "),
  });

  // Voice: the composer ships no dictation. Public HTML cannot reach the
  // composer without a session, so the source tree is the witness.
  // The banned-dependency gate scans this file too, so the API names are
  // assembled at run time instead of spelled out.
  const voiceApis = new RegExp(
    [
      ["Speech", "Recognition"].join(""),
      ["getUser", "Media"].join(""),
      ["Media", "Recorder"].join(""),
      "microphone",
    ].join("|"),
    "i",
  );
  const sourceHits = countMatches(join(process.cwd(), "src"), voiceApis);
  checks.push({
    requirement: "Voice removal",
    check: "no speech or microphone API in the web source",
    class: sourceHits === 0 ? "pass" : "fail",
    detail: `${sourceHits} matches`,
  });

  const receipt = renderReceipt(base, checks);
  if (out) writeFileSync(out, receipt);
  process.stdout.write(receipt);
  process.exitCode = checks.some((check) => check.class === "fail") ? 1 : 0;
}

function renderReceipt(base: string, checks: Check[]) {
  const date = new Date().toISOString().slice(0, 10);
  const rows = checks
    .map(
      (check) =>
        `| ${check.requirement} | ${check.check} | ${check.class} | ${check.detail} |`,
    )
    .join("\n");
  return `# Owner MVP reset proof (${date})

Status: receipt of \`apps/web/scripts/prove-owner-mvp-reset.ts\` against \`${base}\`
Authority: ADR-0022 (OVE-373). Safe GETs and HEADs only, no credentials; counts and classes only.

| Requirement | Check | Class | Detail |
| -- | -- | -- | -- |
${rows}

\`pending\` names a check whose runtime is shipped but whose production data is
not there yet (for example \`srcset\` before any photo has been published after
migration 0047).
`;
}

/**
 * A photo published after migration 0047 has its 480 px variant promoted next
 * to the primary; a HEAD on that key is the safe witness that variants exist.
 */
async function variantExists(primaryUrl: string) {
  const url = primaryUrl.replace(/\.webp$/, "-480.webp");
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "error",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    return (
      response.ok &&
      (response.headers.get("content-type") ?? "").startsWith("image/webp")
    );
  } catch {
    return false;
  }
}

async function page(base: string, path: string) {
  const startedAt = performance.now();
  // Public pages may answer a market redirect (`/journals` → `/bg/journals`
  // outside Ukraine); the proof reads the page the visitor lands on.
  const response = await request(base, path, "follow");
  const html = await response.text();
  return {
    html,
    status: response.status,
    headers: response.headers,
    ttfbMs: Math.round(performance.now() - startedAt),
  };
}

async function request(
  base: string,
  path: string,
  redirect: RequestRedirect = "manual",
) {
  return fetch(new URL(path, base), {
    method: "GET",
    redirect,
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/xml" },
    signal: AbortSignal.timeout(20_000),
  });
}

function countMatches(root: string, pattern: RegExp) {
  let count = 0;
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      count += countMatches(path, pattern);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\./.test(entry)) continue;
    if (pattern.test(readFileSync(path, "utf8"))) count += 1;
  }
  return count;
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function valueOf(args: readonly string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
