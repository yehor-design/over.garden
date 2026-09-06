import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Wikidata is an offline source (OVE-393, ADR-0026 D2).
 *
 * The crosswalk runs in the matching worker: it is polite, serial and slow by
 * design, and Wikimedia's policy assumes exactly that. A request path that
 * called it would put a gardener's page behind someone else's rate limit, and
 * no unit render would show it — the call would simply be slow in production.
 * So the rule is checked where it can be: in the source of the web app.
 */
const WEB_SOURCE = join(import.meta.dirname, "..", "..");
const FORBIDDEN = [
  "query.wikidata.org",
  "wikidata.org/w/api.php",
  "wbgetentities",
];

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

describe("Wikidata never runs on a request path", () => {
  it("is called from no file the web app ships", async () => {
    const offenders: string[] = [];
    for await (const path of walk(WEB_SOURCE)) {
      if (path.endsWith("wikidata-offline.test.ts")) continue;
      const source = await readFile(path, "utf8");
      for (const marker of FORBIDDEN) {
        if (source.includes(marker)) {
          offenders.push(`${path.slice(WEB_SOURCE.length + 1)}: ${marker}`);
        }
      }
    }
    // Falsify by adding a fetch to query.wikidata.org anywhere under src/.
    expect(offenders).toEqual([]);
  });

  it("still links to a Wikidata item from a card, which is a URL and not a call", async () => {
    const addresses = await readFile(
      join(WEB_SOURCE, "lib", "catalog", "addresses.ts"),
      "utf8",
    );
    expect(addresses).toContain("https://www.wikidata.org/wiki/");
  });
});
