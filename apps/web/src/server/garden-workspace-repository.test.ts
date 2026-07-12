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

import type { Database } from "@/db/schema";
import { scopedToUser } from "@/server/request-scope";
import {
  buildGardenWorkspaceInventorySummaryQuery,
  buildGardenWorkspaceMediaStatusQuery,
  buildGardenWorkspaceRecentEntriesQuery,
  buildGardenWorkspaceSpaceSummariesQuery,
  loadGardenWorkspace,
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
    expect(compiled.sql).toContain('"plant_objects"."owner_user_id" = $2');
    expect(compiled.sql).toContain("object_kind");
    expect(compiled.sql).toContain("plant");
    expect(compiled.sql).toContain("animal");
    expect(compiled.sql).toContain("bee_colony");
    expect(compiled.parameters).toEqual(["object", OWNER_ID]);
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
    expect(compiled.sql).toContain('"spaces"."owner_user_id" = $2');
    expect(compiled.sql).toContain(
      '"plant_objects"."owner_user_id" = "journal_entries"."owner_user_id"',
    );
    expect(compiled.sql).toContain("limit $3");
    expect(compiled.parameters).toEqual([
      OWNER_ID,
      OWNER_ID,
      WORKSPACE_RECENT_LIMIT,
    ]);
    expect(compiled.sql).not.toMatch(/\."body"|client_mutation_id|email/i);
  });

  it("counts media processing states only for the scoped owner", () => {
    const compiled = buildGardenWorkspaceMediaStatusQuery(
      testDb,
      scope,
    ).compile();

    expect(compiled.sql).toContain('from "media_assets"');
    expect(compiled.sql).toContain('"owner_user_id" = $1');
    expect(compiled.sql).toContain('group by "status"');
    expect(compiled.parameters).toEqual([OWNER_ID, "quarantined", "failed"]);
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

  it("supports deterministic section faults without invoking the affected source", async () => {
    const sources = workspaceSources();

    const workspace = await loadGardenWorkspace(
      scope,
      {
        inventoryExpanded: false,
        inventoryPage: 1,
        spacesExpanded: false,
        faultSections: ["recent", "media"],
      },
      sources,
    );

    expect(workspace.inventory.status).toBe("ready");
    expect(workspace.recent.status).toBe("error");
    expect(workspace.media.status).toBe("error");
    expect(sources.recent).not.toHaveBeenCalled();
    expect(sources.media).not.toHaveBeenCalled();
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
      beeColonyCount: inventoryObjects.filter(
        (item) => item.objectKind === "bee_colony",
      ).length,
      archivedEntryCount: 0,
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
          beeColonyCount: 0,
        },
      ],
    }),
    recent: vi.fn().mockResolvedValue([]),
    inbox: vi.fn().mockResolvedValue({ notificationCount: 0, claimCount: 0 }),
    media: vi.fn().mockResolvedValue({
      processingCount: 0,
      failedCount: 0,
    }),
  };
}

function workspaceObject(index: number, ownerUserId: string) {
  const objectKind =
    index % 3 === 0
      ? ("bee_colony" as const)
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
    publicEntryCount: 0,
    privateEntryCount: 1,
    archivedEntryCount: 0,
    latestEntryDate: new Date("2026-07-01T00:00:00.000Z"),
    coverMedia: null,
  };
}
