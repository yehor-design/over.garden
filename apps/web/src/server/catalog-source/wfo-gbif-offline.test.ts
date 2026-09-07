import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * World Flora Online and GBIF are offline sources (OVE-396, ADR-0026 D2).
 *
 * Both are read as whole releases — a 122 MB zip and a 466 MB gzip — by the
 * matching worker, once per refresh. A request path that reached for either
 * would put a gardener's page behind a several-minute download on somebody
 * else's bandwidth, and no unit render would show it: the call would simply be
 * slow in production. So the rule is checked where it can be, in the source of
 * the web app.
 *
 * What is checked is a **call**, not a mention. Both hosts appear all over
 * this codebase as provenance — `catalog_source_snapshots.source_url` is the
 * address a fact came from, and a card shows it — and a rule that forbade the
 * string would forbid saying where the data is from. So the guard reads the
 * argument of every `fetch`, which is how this app makes an outbound request,
 * and a provider address that never reaches one is not a call.
 */
const WEB_SOURCE = join(import.meta.dirname, "..", "..");
const FORBIDDEN_HOSTS = [
  "api.gbif.org",
  "hosted-datasets.gbif.org",
  "zenodo.org",
  "files.worldfloraonline.org",
];

/** Every `fetch(...)` argument list in a file, as text. */
function fetchArguments(source: string): string[] {
  return [...source.matchAll(/\bfetch\s*\(/gu)].map((match) =>
    source.slice(
      match.index + match[0].length,
      match.index + match[0].length + 400,
    ),
  );
}

async function* walk(directory: string): AsyncGenerator<string> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (/\.(ts|tsx)$/u.test(entry.name)) yield path;
  }
}

describe("WFO and GBIF never run on a request path", () => {
  it("is fetched by no file the web app ships", async () => {
    const offenders: string[] = [];
    for await (const path of walk(WEB_SOURCE)) {
      if (path.endsWith("wfo-gbif-offline.test.ts")) continue;
      const source = await readFile(path, "utf8");
      for (const call of fetchArguments(source)) {
        for (const host of FORBIDDEN_HOSTS) {
          if (call.includes(host)) {
            offenders.push(`${path.slice(WEB_SOURCE.length + 1)}: ${host}`);
          }
        }
      }
    }
    // Falsify by adding `fetch("https://api.gbif.org/v1/species/match")`
    // anywhere under src/.
    expect(offenders).toEqual([]);
  });

  it("catches a call it should catch", async () => {
    // The guard above passes on a codebase that mentions both hosts dozens of
    // times, so it has to be shown refusing something.
    expect(
      fetchArguments(
        'const answer = await fetch("https://api.gbif.org/v1/species/match?name=x");',
      ).some((call) => call.includes("api.gbif.org")),
    ).toBe(true);
    expect(
      fetchArguments('const url = "https://api.gbif.org/v1/species/match";')
        .length,
    ).toBe(0);
  });

  it("still links to a WFO taxon and a GBIF species, which are URLs and not calls", async () => {
    const addresses = await readFile(
      join(WEB_SOURCE, "lib", "catalog", "addresses.ts"),
      "utf8",
    );
    expect(addresses).toContain("https://www.worldfloraonline.org/taxon/");
    expect(addresses).toContain("https://www.gbif.org/species/");
  });
});
