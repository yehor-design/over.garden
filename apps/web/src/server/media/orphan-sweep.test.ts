import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/storage", () => ({
  deletePublicDerivativeObject: vi.fn(),
  listPublicDerivativeObjects: vi.fn(),
}));
vi.mock("@/server/media/media-variant-schema", () => ({
  readMediaVariantExtras: vi.fn(async (_executor: unknown, ids: string[]) =>
    new Map(
      ids
        .filter((id) => id === "live-with-variants")
        .map((id) => [id, { placeholderDataUri: null, variantLongEdges: [480] }]),
    ),
  ),
}));

import { primaryKeyOf, sweepMediaOrphans } from "./orphan-sweep";

const NOW = Date.UTC(2026, 8, 3, 5, 0, 0);
const EIGHT_DAYS_AGO = new Date(NOW - 8 * 24 * 60 * 60 * 1_000);
const YESTERDAY = new Date(NOW - 24 * 60 * 60 * 1_000);

function executorWithRows(rows: Array<{ id: string; derivative_key: string }>) {
  const chain = {
    select: () => chain,
    where: (_column: string, _op: string, keys: string[]) => ({
      ...chain,
      execute: async () => rows.filter((row) => keys.includes(row.derivative_key)),
    }),
    execute: async () => rows,
  };
  return { selectFrom: () => chain } as never;
}

describe("media orphan sweep (OVE-372)", () => {
  it("derives the primary key of a variant object", () => {
    expect(primaryKeyOf("derivatives/a/3-1280.webp")).toBe("derivatives/a/3.webp");
    expect(primaryKeyOf("derivatives/a/3-480.webp")).toBe("derivatives/a/3.webp");
    expect(primaryKeyOf("derivatives/a/3.webp")).toBe("derivatives/a/3.webp");
  });

  it("deletes an unreferenced eight-day-old object and keeps referenced, recent, and variant objects", async () => {
    const removed: string[] = [];
    const receipt = await sweepMediaOrphans({
      executor: executorWithRows([
        { id: "live", derivative_key: "derivatives/live/1.webp" },
        {
          id: "live-with-variants",
          derivative_key: "derivatives/live-with-variants/2.webp",
        },
      ]),
      now: () => NOW,
      list: async ({ continuationToken }) =>
        continuationToken === null
          ? {
              objects: [
                { key: "derivatives/live/1.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
                { key: "derivatives/live/1-480.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
                { key: "derivatives/gone/1.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
                { key: "derivatives/gone/1-1280.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
                { key: "derivatives/fresh/1.webp", lastModified: YESTERDAY, size: 1 },
              ],
              nextContinuationToken: "page-2",
            }
          : {
              objects: [
                {
                  key: "derivatives/live-with-variants/2-480.webp",
                  lastModified: EIGHT_DAYS_AGO,
                  size: 1,
                },
                { key: "derivatives/unknown-age/1.webp", lastModified: null, size: 1 },
              ],
              nextContinuationToken: null,
            },
      remove: async (key) => {
        removed.push(key);
      },
    });

    expect(removed.sort()).toEqual([
      "derivatives/gone/1-1280.webp",
      "derivatives/gone/1.webp",
    ]);
    expect(receipt).toMatchObject({
      listed: 7,
      eligible: 5,
      referenced: 3,
      deleted: 2,
      failed: 0,
      pages: 2,
      deadlineReached: false,
    });
  });

  it("counts a failed delete and stops at its deadline without claiming success", async () => {
    let clock = NOW;
    const receipt = await sweepMediaOrphans({
      executor: executorWithRows([]),
      now: () => clock,
      deadlineMs: 10,
      list: async () => ({
        objects: [
          { key: "derivatives/a/1.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
          { key: "derivatives/b/1.webp", lastModified: EIGHT_DAYS_AGO, size: 1 },
        ],
        nextContinuationToken: "more",
      }),
      remove: async (key) => {
        if (key === "derivatives/a/1.webp") throw new Error("provider_error");
        clock += 20;
      },
    });

    expect(receipt).toMatchObject({
      deleted: 1,
      failed: 1,
      deadlineReached: true,
    });
  });
});
