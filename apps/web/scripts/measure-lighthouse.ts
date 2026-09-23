import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * A public page's performance, measured the way ADR-0032 D9 says.
 *
 *   pnpm build && pnpm exec next start -p 3179
 *   pnpm measure:lighthouse --base-url http://localhost:3179 \
 *     --label before --out <dir> / /@handle/post/1 /variety/slug
 *
 * Lighthouse CLI 13.5.0 with its default mobile emulation: three runs per page
 * with throttling **applied** (`devtools` — the gate), and three **simulated**,
 * recorded beside it because simulation charges LCP with every script that ran
 * before the paint, which is to say it measures the bundle. A "before" and its
 * "after" are taken in the same environment, on the same data, by this same
 * command.
 *
 * Each report is kept gzipped and without its screenshots; `<label>.json`
 * holds every sample — LCP and its phases, the LCP element, TTI, TBT, CLS and
 * the script bytes — and the median of each figure per page and method.
 */

const LIGHTHOUSE = "lighthouse@13.5.0";
const METHODS = ["devtools", "simulate"] as const;

type Method = (typeof METHODS)[number];

interface Sample {
  page: string;
  method: Method;
  run: number;
  report: string;
  fetchTime: string;
  lighthouseVersion: string;
  finalDisplayedUrl: string;
  lcpMs: number | null;
  fcpMs: number | null;
  ttiMs: number | null;
  tbtMs: number | null;
  speedIndexMs: number | null;
  cls: number | null;
  scriptTransferBytes: number | null;
  totalTransferBytes: number | null;
  scriptBootupMs: number | null;
  lcpElement: string | null;
  lcpPhases: Record<string, number> | null;
}

type Audits = Record<
  string,
  { numericValue?: number; details?: Record<string, unknown> } | undefined
>;

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

function slug(pagePath: string) {
  const cleaned = pagePath.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "");
  return cleaned.length > 0 ? cleaned.slice(0, 60) : "home";
}

function numeric(audits: Audits, id: string) {
  const value = audits[id]?.numericValue;
  return typeof value === "number" ? value : null;
}

/** The first DOM node a Lighthouse audit's details point at. */
function firstNode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "node") {
    const snippet = typeof record.snippet === "string" ? record.snippet : "";
    const selector = typeof record.selector === "string" ? record.selector : "";
    return `${selector} ${snippet}`.trim().slice(0, 240) || null;
  }
  for (const child of Object.values(record)) {
    const found = firstNode(child);
    if (found) return found;
  }
  return null;
}

/** TTFB, load delay, load time and render delay: which defect is on the page. */
function lcpPhases(audits: Audits): Record<string, number> | null {
  const phases: Record<string, number> = {};
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (typeof record.phase === "string" && typeof record.timing === "number") {
      phases[record.phase] = record.timing;
      return;
    }
    for (const child of Object.values(record)) visit(child);
  };
  visit(audits["largest-contentful-paint-element"]?.details);
  visit(audits["lcp-breakdown-insight"]?.details);
  return Object.keys(phases).length > 0 ? phases : null;
}

function scriptTransfer(audits: Audits) {
  const items = (audits["resource-summary"]?.details?.items ?? []) as Array<{
    resourceType?: string;
    transferSize?: number;
  }>;
  const script = items.find((item) => item.resourceType === "script");
  return typeof script?.transferSize === "number" ? script.transferSize : null;
}

function median(values: Array<number | null>) {
  const known = values
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);
  if (known.length === 0) return null;
  const middle = Math.floor(known.length / 2);
  return known.length % 2 === 1
    ? known[middle]!
    : (known[middle - 1]! + known[middle]!) / 2;
}

function run(
  baseUrl: string,
  pagePath: string,
  method: Method,
  index: number,
  outDir: string,
  label: string,
): Sample {
  const name = `${label}-${slug(pagePath)}-${method}-${index}`;
  const output = path.join(outDir, `${name}.json`);
  execFileSync(
    "npx",
    [
      "-y",
      LIGHTHOUSE,
      new URL(pagePath, baseUrl).toString(),
      "--output=json",
      `--output-path=${output}`,
      `--throttling-method=${method}`,
      "--only-categories=performance",
      "--quiet",
      "--chrome-flags=--headless=new",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const report = JSON.parse(readFileSync(output, "utf8")) as {
    fetchTime: string;
    lighthouseVersion: string;
    finalDisplayedUrl: string;
    audits: Audits;
    fullPageScreenshot?: unknown;
  };
  const audits = report.audits;
  const sample: Sample = {
    page: pagePath,
    method,
    run: index,
    report: `${name}.json.gz`,
    fetchTime: report.fetchTime,
    lighthouseVersion: report.lighthouseVersion,
    finalDisplayedUrl: report.finalDisplayedUrl,
    lcpMs: numeric(audits, "largest-contentful-paint"),
    fcpMs: numeric(audits, "first-contentful-paint"),
    ttiMs: numeric(audits, "interactive"),
    tbtMs: numeric(audits, "total-blocking-time"),
    speedIndexMs: numeric(audits, "speed-index"),
    cls: numeric(audits, "cumulative-layout-shift"),
    scriptTransferBytes: scriptTransfer(audits),
    totalTransferBytes: numeric(audits, "total-byte-weight"),
    scriptBootupMs: numeric(audits, "bootup-time"),
    lcpElement: firstNode(audits["largest-contentful-paint-element"]?.details),
    lcpPhases: lcpPhases(audits),
  };
  // The numbers and diagnostics stay; the screenshots are most of the bytes.
  delete audits["final-screenshot"];
  delete audits["screenshot-thumbnails"];
  delete report.fullPageScreenshot;
  writeFileSync(`${output}.gz`, gzipSync(JSON.stringify(report)));
  rmSync(output);
  return sample;
}

function main() {
  const baseUrl = option("base-url");
  const label = option("label");
  const outDir = option("out");
  const runs = Number(option("runs") ?? "3");
  const pages = pagesFromArgs();
  if (!baseUrl || !label || !outDir || pages.length === 0) {
    throw new Error(
      "Usage: measure-lighthouse --base-url <url> --label <name> --out <dir> [--runs 3] <path>…",
    );
  }
  mkdirSync(outDir, { recursive: true });

  const samples: Sample[] = [];
  for (const pagePath of pages) {
    for (const method of METHODS) {
      for (let index = 1; index <= runs; index += 1) {
        const sample = run(baseUrl, pagePath, method, index, outDir, label);
        samples.push(sample);
        console.log(
          `${pagePath} ${method} #${index}: LCP ${sample.lcpMs?.toFixed(0)} ms, TTI ${sample.ttiMs?.toFixed(0)} ms, TBT ${sample.tbtMs?.toFixed(0)} ms, CLS ${sample.cls?.toFixed(3)}`,
        );
      }
    }
  }

  const figures = [
    "lcpMs",
    "fcpMs",
    "ttiMs",
    "tbtMs",
    "speedIndexMs",
    "cls",
    "scriptTransferBytes",
    "totalTransferBytes",
    "scriptBootupMs",
  ] as const;
  const medians = pages.flatMap((pagePath) =>
    METHODS.map((method) => {
      const group = samples.filter(
        (sample) => sample.page === pagePath && sample.method === method,
      );
      return {
        page: pagePath,
        method,
        runs: group.length,
        ...Object.fromEntries(
          figures.map((figure) => [
            figure,
            median(group.map((sample) => sample[figure])),
          ]),
        ),
      };
    }),
  );

  writeFileSync(
    path.join(outDir, `${label}.json`),
    JSON.stringify(
      {
        label,
        baseUrl,
        lighthouse: LIGHTHOUSE,
        method:
          "Lighthouse CLI, default mobile emulation, performance only; three runs per page with throttling applied (devtools, the gate) and three simulated (ADR-0032 D9).",
        measuredAt: new Date().toISOString(),
        medians,
        samples,
      },
      null,
      2,
    ) + "\n",
  );
  for (const row of medians) console.log(JSON.stringify(row));
}

main();
