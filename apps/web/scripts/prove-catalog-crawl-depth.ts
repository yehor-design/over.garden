/**
 * Walks the site from `/` the way a crawler without JavaScript does, and
 * reports how deep an organism page is (OVE-431).
 *
 * The catalog had 114 669 pages and eleven inbound internal links — one per
 * journal entry — so all but a handful were reachable only from the sitemap,
 * and a page nothing links to is low-priority to crawl however good the
 * sitemap is. The acceptance criterion is a number: every indexable organism
 * page within four clicks of `/`. This measures it.
 *
 * It reads the HTML and never executes it, which is the point: a link that
 * needs hydration is not a crawl path (ADR-0024). `<a href>` in the served
 * markup is the only thing it follows.
 *
 * Breadth-first, bounded: a maximum depth, a maximum number of fetches, and
 * only same-origin document links. It reports the shallowest depth at which an
 * organism address appears, and the first few it found there.
 *
 *   pnpm exec tsx scripts/prove-catalog-crawl-depth.ts --base-url https://over.garden
 */
import process from "node:process";

const ORGANISM_PATH =
  /^\/(?:(?:uk|bg|ru)\/)?(?:species\/[^/]+(?:\/[^/]+)?|variety\/[^/]+|breed\/[^/]+)$/u;

const SKIP_PREFIX = [
  "/api/",
  "/_next/",
  "/garden",
  "/account",
  "/auth",
  "/operator",
  "/sitemap",
];

interface CrawlResult {
  readonly baseUrl: string;
  readonly maxDepth: number;
  readonly fetched: number;
  readonly organismDepth: number | null;
  readonly organismsFound: number;
  readonly sampleAtShallowestDepth: readonly string[];
  readonly catalogFrontDoorDepth: number | null;
  readonly pathToFirstOrganism: readonly string[];
}

function valueFor(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

/** Every same-origin document link in the served HTML, deduplicated. */
export function documentLinks(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/giu)) {
    const raw = match[1]!;
    if (!raw.startsWith("/") || raw.startsWith("//")) continue;
    const path = raw.split("#")[0]!;
    if (path.length === 0) continue;
    if (SKIP_PREFIX.some((prefix) => path.startsWith(prefix))) continue;
    found.add(path);
  }
  return [...found];
}

export function isOrganismPath(path: string): boolean {
  return ORGANISM_PATH.test(path.split("?")[0]!);
}

export async function crawlForOrganisms(input: {
  baseUrl: string;
  maxDepth: number;
  maxFetches: number;
  fetchPath: (path: string) => Promise<string | null>;
}): Promise<CrawlResult> {
  const seen = new Set<string>(["/"]);
  const parent = new Map<string, string>();
  let frontier: string[] = ["/"];
  let fetched = 0;
  let organismDepth: number | null = null;
  let catalogFrontDoorDepth: number | null = null;
  const organisms = new Set<string>();
  let sample: string[] = [];

  for (let depth = 0; depth <= input.maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const path of frontier) {
      if (fetched >= input.maxFetches) break;
      const html = await input.fetchPath(path);
      fetched += 1;
      if (html === null) continue;
      for (const link of documentLinks(html)) {
        if (seen.has(link)) continue;
        seen.add(link);
        parent.set(link, path);
        if (link.split("?")[0]!.replace(/\/+$/u, "").endsWith("/species")) {
          catalogFrontDoorDepth ??= depth + 1;
        }
        if (isOrganismPath(link)) {
          organisms.add(link);
          if (organismDepth === null) {
            organismDepth = depth + 1;
            sample = [];
          }
          if (organismDepth === depth + 1 && sample.length < 5) sample.push(link);
          continue;
        }
        next.push(link);
      }
    }
    frontier = next;
  }

  const first = sample[0];
  const trail: string[] = [];
  for (let node = first; node; node = parent.get(node)) {
    trail.unshift(node);
    if (node === "/") break;
  }

  return {
    baseUrl: input.baseUrl,
    maxDepth: input.maxDepth,
    fetched,
    organismDepth,
    organismsFound: organisms.size,
    sampleAtShallowestDepth: sample,
    catalogFrontDoorDepth,
    pathToFirstOrganism: trail,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const baseUrl = (valueFor(argv, "--base-url") ?? "https://over.garden").replace(
    /\/+$/u,
    "",
  );
  const maxDepth = Number(valueFor(argv, "--max-depth") ?? "4");
  const maxFetches = Number(valueFor(argv, "--max-fetches") ?? "80");

  const result = await crawlForOrganisms({
    baseUrl,
    maxDepth,
    maxFetches,
    fetchPath: async (path) => {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: "follow",
        headers: { "user-agent": "overgarden-crawl-depth-proof" },
      });
      return response.ok ? await response.text() : null;
    },
  });

  console.log(
    JSON.stringify(
      { schemaVersion: "overgarden.catalogCrawlDepth.v1", ...result },
      null,
      2,
    ),
  );
  if (result.organismDepth === null || result.organismDepth > 4) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("prove-catalog-crawl-depth.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
