import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium, type Page } from "playwright";

/**
 * OVE-468: what a guest's browser downloads and runs on a reading page.
 *
 *   pnpm build && pnpm exec next start -p 3179
 *   pnpm measure:guest-script --base-url http://localhost:3179 \
 *     --label before --out <dir> / /@handle/post/1 /variety/slug
 *
 * For each page, a fresh guest context loads the address, waits for the
 * network to go quiet and the page to idle, and records every script response:
 *
 * - `transfer` — the encoded body bytes the network carried (what a slow
 *   phone waits for);
 * - `decoded` — the bytes the engine had to parse;
 * - `executed` — the bytes of those scripts that actually ran before idle, from
 *   V8's block coverage. The difference is script a guest paid for and never
 *   needed.
 *
 * Nothing is clicked: this is the reader who opens a link and reads. A
 * control's code that arrives only when pressed is, correctly, not counted.
 */

interface ScriptRecord {
  url: string;
  transfer: number;
  decoded: number;
  executed: number | null;
  /** Finished before the page's load event, or fetched after it (prefetch, idle). */
  phase: "before-load" | "after-load";
}

interface PageRecord {
  path: string;
  status: number | null;
  scripts: number;
  transfer: number;
  decoded: number;
  executed: number;
  /** The part a reader waits for: scripts finished before the load event. */
  beforeLoad: { scripts: number; transfer: number; decoded: number };
  chunks: ScriptRecord[];
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function pagesFromArgs(): string[] {
  const pages: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index]!;
    if (value.startsWith("--")) {
      index += 1;
      continue;
    }
    if (value.startsWith("/")) pages.push(value);
  }
  return pages;
}

/** Bytes of a script that ran, from V8 block coverage (nested ranges win). */
function executedBytes(entry: {
  source?: string;
  functions: Array<{
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
  }>;
}): number {
  const length = entry.source?.length ?? 0;
  if (length === 0) return 0;
  const used = new Uint8Array(length);
  for (const fn of entry.functions) {
    for (const range of fn.ranges) {
      used.fill(
        range.count > 0 ? 1 : 0,
        Math.max(0, range.startOffset),
        Math.min(length, range.endOffset),
      );
    }
  }
  let total = 0;
  for (const byte of used) total += byte;
  return total;
}

async function measure(
  page: Page,
  baseUrl: string,
  pagePath: string,
): Promise<PageRecord> {
  const scripts = new Map<string, ScriptRecord>();
  const pending: Promise<void>[] = [];
  let loaded = false;
  page.once("load", () => {
    loaded = true;
  });
  page.on("response", (response) => {
    if (response.request().resourceType() !== "script") return;
    const phase = loaded ? "after-load" : "before-load";
    pending.push(
      (async () => {
        const sizes = await response
          .request()
          .sizes()
          .catch(() => null);
        const body = await response.body().catch(() => null);
        scripts.set(response.url(), {
          url: response.url().replace(baseUrl, ""),
          transfer: sizes?.responseBodySize ?? 0,
          decoded: body?.length ?? 0,
          executed: null,
          phase,
        });
      })(),
    );
  });
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  const response = await page.goto(`${baseUrl}${pagePath}`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  // Idle: a reader who reads. Anything that loads on idle is counted.
  await page.waitForTimeout(3_000);
  const coverage = await page.coverage.stopJSCoverage();
  await Promise.all(pending);
  for (const entry of coverage) {
    const record = scripts.get(entry.url);
    if (record) record.executed = executedBytes(entry);
  }
  const chunks = [...scripts.values()].sort((a, b) => b.decoded - a.decoded);
  const early = chunks.filter((chunk) => chunk.phase === "before-load");
  return {
    path: pagePath,
    status: response?.status() ?? null,
    scripts: chunks.length,
    transfer: chunks.reduce((sum, chunk) => sum + chunk.transfer, 0),
    decoded: chunks.reduce((sum, chunk) => sum + chunk.decoded, 0),
    executed: chunks.reduce((sum, chunk) => sum + (chunk.executed ?? 0), 0),
    beforeLoad: {
      scripts: early.length,
      transfer: early.reduce((sum, chunk) => sum + chunk.transfer, 0),
      decoded: early.reduce((sum, chunk) => sum + chunk.decoded, 0),
    },
    chunks,
  };
}

async function main() {
  const baseUrl = option("base-url") ?? "http://localhost:3179";
  const label = option("label") ?? "measurement";
  const out = option("out") ?? path.join(process.cwd(), "test-results");
  const pages = pagesFromArgs();
  if (pages.length === 0) throw new Error("Name at least one page path.");
  const browser = await chromium.launch({ headless: true });
  const records: PageRecord[] = [];
  try {
    for (const pagePath of pages) {
      const context = await browser.newContext({
        viewport: { width: 1_280, height: 900 },
      });
      await context.addCookies([
        { name: "overgarden_interface_locale", value: "uk", url: baseUrl },
        { name: "overgarden_interface_market", value: "ukraine", url: baseUrl },
      ]);
      const page = await context.newPage();
      records.push(await measure(page, baseUrl, pagePath));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const receipt = {
    issue: "OVE-468",
    proof: "guest-script",
    label,
    baseUrl,
    measuredAt: new Date().toISOString(),
    pages: records,
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, `guest-script-${label}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  for (const record of records) {
    console.log(
      `${record.path}: ${record.scripts} scripts, ${(record.transfer / 1000).toFixed(1)} kB transfer, ${(record.decoded / 1000).toFixed(1)} kB decoded, ${(record.executed / 1000).toFixed(1)} kB executed; before load ${record.beforeLoad.scripts} scripts, ${(record.beforeLoad.transfer / 1000).toFixed(1)} kB transfer`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
