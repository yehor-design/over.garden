import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const WEB_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const VERCEL_JSON = path.join(WEB_ROOT, "vercel.json");
const APP_ROOT = path.join(WEB_ROOT, "src/app");
const CRON_ROOT = path.join(APP_ROOT, "api/cron");

interface VercelCron {
  path: string;
  schedule: string;
}

async function readCrons(): Promise<VercelCron[]> {
  const config = JSON.parse(await readFile(VERCEL_JSON, "utf8")) as {
    crons?: VercelCron[];
  };
  return config.crons ?? [];
}

function routeFileFor(cronPath: string): string {
  return path.join(APP_ROOT, cronPath, "route.ts");
}

/**
 * Vercel Cron invokes a scheduled path with GET.
 *
 * `/api/cron/media-lifecycle` exported POST only. The schedule fired every day
 * at 03:00 UTC, Next answered 405, and the workflow behind it never ran once —
 * `media_lifecycle_retention_runs` was empty, nine queue rows sat at
 * `attempts = 0`, and five derivatives of deleted journal entries were still
 * served with HTTP 200. The route was correct, the schedule was correct, and
 * nothing in between checked that they agreed.
 */
describe("vercel cron contract", () => {
  it("gives every scheduled path a route that answers the method Vercel sends", async () => {
    const crons = await readCrons();
    expect(crons.length).toBeGreaterThan(0);

    const unreachable: string[] = [];
    for (const cron of crons) {
      const source = await readFile(routeFileFor(cron.path), "utf8").catch(
        () => null,
      );
      if (source === null) {
        unreachable.push(`${cron.path}: no route.ts`);
        continue;
      }
      if (!/export\s+(async\s+)?function\s+GET\b/u.test(source)) {
        unreachable.push(`${cron.path}: route exports no GET`);
      }
    }

    // Falsify by deleting the GET export from any cron route.
    expect(unreachable).toEqual([]);
  });

  it("refuses an unauthenticated caller on every scheduled path", async () => {
    const crons = await readCrons();
    const unguarded: string[] = [];
    for (const cron of crons) {
      const source = await readFile(routeFileFor(cron.path), "utf8").catch(
        () => null,
      );
      if (source === null) continue;
      if (!source.includes("CRON_SECRET") || !source.includes("401")) {
        unguarded.push(cron.path);
      }
    }
    expect(unguarded).toEqual([]);
  });

  it("schedules every cron route that exists, so none is dead code", async () => {
    // The other direction: a route under api/cron that no schedule invokes is
    // either dead or was meant to be scheduled and never was.
    const directories = (await readdir(CRON_ROOT, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/api/cron/${entry.name}`)
      .sort();
    const scheduled = (await readCrons()).map((cron) => cron.path).sort();

    expect(directories).toEqual(scheduled);
  });

  it("keeps every schedule a valid five-field cron expression", async () => {
    for (const cron of await readCrons()) {
      expect([cron.path, cron.schedule.trim().split(/\s+/u).length]).toEqual([
        cron.path,
        5,
      ]);
    }
  });
});
