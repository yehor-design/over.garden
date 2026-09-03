import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
} from "kysely";
import { describe, expect, it, vi } from "vitest";
import { failedSection } from "@/server/workspace-failure";

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  buildGardenWorkspaceInventorySummaryQuery,
  buildGardenWorkspaceRecentEntriesQuery,
  buildGardenWorkspaceSpaceSummariesQuery,
  loadGardenWorkspace,
  WORKSPACE_SECTION_DEADLINE_MS,
  WORKSPACE_INVENTORY_PAGE_SIZE,
  WORKSPACE_INVENTORY_PREVIEW_SIZE,
  WORKSPACE_RECENT_LIMIT,
  WORKSPACE_SPACE_PREVIEW_SIZE,
  type GardenWorkspaceSources,
} from "./garden-workspace-repository";

class TestPostgresDialect implements Dialect {
  createDriver(): Driver {
    return new DummyDriver();
  }

  createQueryCompiler(): QueryCompiler {
    return new PostgresQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new PostgresAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}

const testDb = new Kysely<Database>({ dialect: new TestPostgresDialect() });
const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "00000000-0000-4000-8000-000000000002";
const scope = scopedToUser(OWNER_ID, "session-1");

describe("garden workspace query contracts", () => {
  it("counts inventory only for the scoped owner and groups every living-object kind", () => {
    const compiled = buildGardenWorkspaceInventorySummaryQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "plant_objects"');
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $1');
    expect(compiled.sql).toContain("object_kind");
    expect(compiled.sql).toContain("plant");
    expect(compiled.sql).toContain("animal");
    expect(compiled.parameters).toEqual([OWNER_ID]);
  });

  it("counts inventory without touching journal_entries at all", () => {
    const compiled = buildGardenWorkspaceInventorySummaryQuery(
      testDb,
      scope,
    ).compile();

    // A left join to `journal_entries` used to sit here contributing nothing:
    // absent from the select list and the predicate, it could only duplicate
    // left rows for `count(distinct …)` to collapse again. Its cost scaled with
    // the owner's own journal — 8.713 ms and 35,878 shared-buffer hits at 4,000
    // objects and 32,000 entries, against 0.346 ms and 30 hits without it.
    //
    // Guarding the join alone would not hold: reintroducing it *with* the
    // distinct would restore the cost while every count still matched. Both
    // halves are asserted, and the parameter list is asserted exactly, so a
    // join carrying its own bound value cannot slip back in silently.
    expect(compiled.sql).not.toContain("journal_entries");
    expect(compiled.sql).not.toContain("join");
    expect(compiled.sql).not.toContain("distinct");
    expect(compiled.parameters).toHaveLength(1);
  });

  it("keeps the recent-entries ordering aligned with its supporting index", () => {
    const compiled = buildGardenWorkspaceRecentEntriesQuery(
      testDb,
      scope,
    ).compile();

    // `journal_entries_owner_recent_idx` is
    //   (owner_user_id, entry_date desc, created_at desc, id asc)
    //   where lifecycle_state = 'active'
    // and a b-tree eliminates the sort only while the requested ordering is
    // the index ordering. Changing either the order of these three keys or a
    // direction silently drops the query back to reading every active entry the
    // owner has written and sorting the lot — 7.038 ms and 657 buffer hits at
    // 40,000 entries, against 0.035 ms and 13 hits on the index.
    //
    // The predicate is asserted too: the partial index is only eligible while
    // the query constrains `lifecycle_state` to the same constant.
    const orderBy = compiled.sql.slice(compiled.sql.indexOf("order by"));
    expect(orderBy).toContain('"journal_entries"."entry_date" desc');
    expect(orderBy).toContain('"journal_entries"."created_at" desc');
    expect(orderBy).toContain('"journal_entries"."id" asc');
    expect(orderBy.indexOf("entry_date")).toBeLessThan(
      orderBy.indexOf("created_at"),
    );
    expect(orderBy.indexOf("created_at")).toBeLessThan(orderBy.indexOf('"id"'));
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" =');
    expect(compiled.parameters).toContain("active");
  });

  it("bounds space summaries and keeps joined objects inside the same owner", () => {
    const compiled = buildGardenWorkspaceSpaceSummariesQuery(testDb, scope, {
      limit: 5,
      offset: 4,
    }).compile();

    expect(compiled.sql).toContain('from "spaces"');
    expect(compiled.sql).toContain('left join "plant_objects"');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "spaces"."owner_user_id"',
    );
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $1');
    expect(compiled.sql).toContain("limit $2");
    expect(compiled.sql).toContain("offset $3");
    expect(compiled.parameters).toEqual([OWNER_ID, 5, 4]);
  });

  it("returns a privacy-minimized bounded continuity projection", () => {
    const compiled = buildGardenWorkspaceRecentEntriesQuery(
      testDb,
      scope,
      WORKSPACE_RECENT_LIMIT,
    ).compile();

    expect(compiled.sql).toContain('"journal_entries"."owner_user_id" = $1');
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $3');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    // OVE-353: a deleted entry leaves the workspace continuity strip at once,
    // filtered canonically rather than hidden by the view.
    expect(compiled.sql).toContain('"journal_entries"."lifecycle_state" = $2');
    expect(compiled.sql).toContain("limit $4");
    expect(compiled.parameters).toEqual([
      OWNER_ID,
      "active",
      OWNER_ID,
      WORKSPACE_RECENT_LIMIT,
    ]);
    expect(compiled.sql).not.toMatch(/\."body"|client_mutation_id|email/i);
  });
});

describe("garden workspace read model", () => {
  it("uses preview-plus-one limits and exposes a real inventory view-all path", async () => {
    const sources = workspaceSources({
      inventoryObjects: Array.from({ length: 9 }, (_, index) =>
        workspaceObject(index + 1, OWNER_ID),
      ),
    });

    const workspace = await loadGardenWorkspace(
      scope,
      { inventoryExpanded: false, inventoryPage: 1, spacesExpanded: false },
      sources,
    );

    expect(sources.inventory).toHaveBeenCalledWith(scope, {
      limit: WORKSPACE_INVENTORY_PREVIEW_SIZE + 1,
      offset: 0,
    });
    expect(sources.spaces).toHaveBeenCalledWith(scope, {
      limit: WORKSPACE_SPACE_PREVIEW_SIZE + 1,
      offset: 0,
    });
    expect(sources.recent).toHaveBeenCalledWith(scope, WORKSPACE_RECENT_LIMIT);
    expect(workspace.inventory.status).toBe("ready");
    if (workspace.inventory.status !== "ready") return;
    expect(workspace.inventory.value.objects).toHaveLength(
      WORKSPACE_INVENTORY_PREVIEW_SIZE,
    );
    expect(workspace.inventory.value.hasMore).toBe(true);
  });

  it("uses bounded pages after inventory view-all is opened", async () => {
    const sources = workspaceSources({
      inventoryObjects: Array.from(
        { length: WORKSPACE_INVENTORY_PAGE_SIZE + 1 },
        (_, index) => workspaceObject(index + 1, OWNER_ID),
      ),
    });

    const workspace = await loadGardenWorkspace(
      scope,
      { inventoryExpanded: true, inventoryPage: 2, spacesExpanded: true },
      sources,
    );

    expect(sources.inventory).toHaveBeenCalledWith(scope, {
      limit: WORKSPACE_INVENTORY_PAGE_SIZE + 1,
      offset: WORKSPACE_INVENTORY_PAGE_SIZE,
    });
    expect(workspace.inventory.status).toBe("ready");
    if (workspace.inventory.status !== "ready") return;
    expect(workspace.inventory.value.objects).toHaveLength(
      WORKSPACE_INVENTORY_PAGE_SIZE,
    );
    expect(workspace.inventory.value.page).toBe(2);
  });

  it("keeps healthy workspace sections visible when recent continuity fails", async () => {
    const sources = workspaceSources();
    sources.recent.mockRejectedValueOnce(new Error("recent unavailable"));

    const workspace = await loadGardenWorkspace(
      scope,
      { inventoryExpanded: false, inventoryPage: 1, spacesExpanded: false },
      sources,
    );

    expect(workspace.inventory.status).toBe("ready");
    expect(workspace.spaces.status).toBe("ready");
    expect(workspace.recent.status).toBe("error");
    expect(workspace.allFailed).toBe(false);
    expect(JSON.stringify(workspace)).not.toContain("recent unavailable");
    expect(JSON.stringify(workspace)).not.toContain(OTHER_OWNER_ID);
  });

  it("settles one never-ending section at the deadline without admitting its late result", async () => {
    vi.useFakeTimers();
    let resolveRecent: (() => void) | undefined;
    const sources = workspaceSources();
    sources.recent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRecent = () => resolve([]);
        }),
    );

    const pending = loadGardenWorkspace(
      scope,
      { inventoryExpanded: false, inventoryPage: 1, spacesExpanded: false },
      sources,
    );
    await vi.advanceTimersByTimeAsync(WORKSPACE_SECTION_DEADLINE_MS);
    const workspace = await pending;

    expect(workspace.recent).toEqual(
      failedSection("query_timeout", { code: "workspace_section_deadline" }),
    );
    expect(workspace.inventory.status).toBe("ready");
    resolveRecent?.();
    await Promise.resolve();
    expect(workspace.recent).toEqual(
      failedSection("query_timeout", { code: "workspace_section_deadline" }),
    );
    vi.useRealTimers();
  });

  it("supports deterministic section faults without invoking the affected source", async () => {
    const sources = workspaceSources();

    const workspace = await loadGardenWorkspace(
      scope,
      {
        inventoryExpanded: false,
        inventoryPage: 1,
        spacesExpanded: false,
        faultSections: ["recent"],
      },
      sources,
    );

    expect(workspace.inventory.status).toBe("ready");
    expect(workspace.recent.status).toBe("error");
    expect(sources.recent).not.toHaveBeenCalled();
    expect(workspace.allFailed).toBe(false);
  });

  it("reports a recoverable full error without leaking repository messages", async () => {
    const sources = workspaceSources();
    for (const source of Object.values(sources)) {
      source.mockRejectedValue(
        new Error(`private database detail ${OTHER_OWNER_ID}`),
      );
    }

    const workspace = await loadGardenWorkspace(
      scope,
      { inventoryExpanded: false, inventoryPage: 1, spacesExpanded: false },
      sources,
    );

    expect(workspace.allFailed).toBe(true);
    expect(JSON.stringify(workspace)).not.toContain("private database detail");
    expect(JSON.stringify(workspace)).not.toContain(OTHER_OWNER_ID);
  });
});

function workspaceSources({
  inventoryObjects = [workspaceObject(1, OWNER_ID)],
}: {
  inventoryObjects?: ReturnType<typeof workspaceObject>[];
} = {}): GardenWorkspaceSources &
  Record<keyof GardenWorkspaceSources, ReturnType<typeof vi.fn>> {
  return {
    inventory: vi.fn().mockResolvedValue({
      totalCount: inventoryObjects.length,
      plantCount: inventoryObjects.filter((item) => item.objectKind === "plant")
        .length,
      animalCount: inventoryObjects.filter(
        (item) => item.objectKind === "animal",
      ).length,
      objects: inventoryObjects,
    }),
    spaces: vi.fn().mockResolvedValue({
      totalCount: 1,
      spaces: [
        {
          id: "space-1",
          displayName: "Balcony",
          objectCount: inventoryObjects.length,
          plantCount: inventoryObjects.length,
          animalCount: 0,
        },
      ],
    }),
    recent: vi.fn().mockResolvedValue([]),
    inbox: vi.fn().mockResolvedValue({ notificationCount: 0, claimCount: 0 }),
  };
}

function workspaceObject(index: number, ownerUserId: string) {
  const objectKind =
    index % 3 === 0
      ? ("animal" as const)
      : index % 3 === 2
        ? ("animal" as const)
        : ("plant" as const);

  return {
    id: `object-${index}`,
    ownerUserId,
    displayName: `Object ${index}`,
    objectKind,
    spaceDisplayName: "Balcony",
    catalogItemId: null,
    catalogKind: null,
    varietyText: null,
    varietyState: "unknown" as const,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    entryCount: 1,
    publicEntryCount: 1,
    latestEntryDate: new Date("2026-07-01T00:00:00.000Z"),
    coverMedia: null,
  };
}
