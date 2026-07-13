import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { GardenWorkspaceReadModel } from "@/server/garden-workspace-repository";
import { GardenWorkspaceView } from "./garden-workspace-view";

const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";

describe("GardenWorkspaceView", () => {
  it("renders an operational home with mixed inventory, continuity, and local work", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        ownerUserId={OWNER_ID}
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={readyWorkspace()}
        localState={{
          online: false,
          drafts: [
            {
              id: "draft-1",
              title: "Пересадка монстери",
              subtitle: "Follow-up · 12 Jul",
              href: "/garden/objects/object-1#follow-up-composer",
            },
          ],
          mutations: [
            {
              id: "mutation-1",
              title: "Фото після пересадки",
              status: "queued",
              href: "/garden/objects/object-1#follow-up-composer",
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-garden-workspace="operational-home"');
    expect(html).toContain("Простір саду");
    expect(html).toContain("Next useful action");
    expect(html).toContain("Update Object 1");
    expect(html).toContain("Plants");
    expect(html).toContain("Animals");
    expect(html).toContain("Bee colonies");
    expect(html).toContain("Spaces");
    expect(html).toContain("View all 5 spaces");
    expect(html).toContain("Living objects");
    expect(html).toContain("View all 9 objects");
    expect(html).toContain("Drafts on this device");
    expect(html).toContain("Пересадка монстери");
    expect(html).toContain("Queued locally");
    expect(html).toContain("Not saved to the server yet");
    expect(html).toContain("1 photo processing");
    expect(html).toContain("1 photo needs attention");
    expect(html).toContain("Recent continuity");
    expect(html).toContain("First flowers");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|latitude|longitude|private body/i,
    );
  });

  it("keeps healthy sections usable when recent continuity fails", () => {
    const workspace = readyWorkspace();
    workspace.recent = { status: "error" };

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        ownerUserId={OWNER_ID}
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain("Living objects");
    expect(html).toContain("Object 1");
    expect(html).toContain("Recent updates are temporarily unavailable");
    expect(html).toContain("Try this section again");
  });

  it("renders one recoverable full-error state inside the shared shell content", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        ownerUserId={OWNER_ID}
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={{
          inventory: { status: "error" },
          spaces: { status: "error" },
          recent: { status: "error" },
          inbox: { status: "error" },
          media: { status: "error" },
          allFailed: true,
        }}
        localState={{
          online: false,
          drafts: [
            {
              id: "draft-error",
              title: "Local recovery draft",
              subtitle: "Object update · 12 Jul",
              href: "/garden#first-entry-composer",
            },
          ],
          mutations: [],
        }}
      />,
    );

    expect(html).toContain("Workspace data is temporarily unavailable");
    expect(html).toContain('href="/garden"');
    expect(html).toContain("Try again");
    expect(html).toContain("Local recovery draft");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("Object 1");
  });

  it("does not present a failed inventory query as an empty garden", () => {
    const workspace = readyWorkspace();
    workspace.inventory = { status: "error" };

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        ownerUserId={OWNER_ID}
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain("Restore your living-object inventory");
    expect(html).toContain("Retry inventory");
    expect(html).not.toContain("Start with one living object");
  });
});

function readyWorkspace(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 9,
        plantCount: 5,
        animalCount: 2,
        beeColonyCount: 2,
        archivedEntryCount: 1,
        objects: [
          {
            id: "object-1",
            displayName: "Object 1",
            objectKind: "plant",
            spaceDisplayName: "Greenhouse",
            catalogItemId: null,
            catalogKind: "species",
            varietyText: "Monstera deliciosa",
            varietyState: "selected",
            createdAt: new Date("2026-07-01T00:00:00.000Z"),
            entryCount: 3,
            publicEntryCount: 1,
            privateEntryCount: 2,
            archivedEntryCount: 0,
            latestEntryDate: new Date("2026-06-01T00:00:00.000Z"),
            coverMedia: {
              publicUrl: "http://localhost:9000/fixture/object-1.png",
              altText: "Monstera leaves",
            },
          },
        ],
        hasMore: true,
        page: 1,
        pageSize: 8,
      },
    },
    spaces: {
      status: "ready",
      value: {
        totalCount: 5,
        spaces: [
          {
            id: "space-1",
            displayName: "Greenhouse",
            objectCount: 5,
            plantCount: 5,
            animalCount: 0,
            beeColonyCount: 0,
          },
        ],
        hasMore: true,
        page: 1,
        pageSize: 4,
      },
    },
    recent: {
      status: "ready",
      value: [
        {
          id: "entry-1",
          title: "First flowers",
          entryScope: "object",
          entryDate: new Date("2026-07-10T00:00:00.000Z"),
          visibility: "private",
          lifecycleState: "active",
          objectId: "object-1",
          objectDisplayName: "Object 1",
          spaceId: "space-1",
          spaceDisplayName: "Greenhouse",
        },
      ],
    },
    inbox: {
      status: "ready",
      value: { notificationCount: 3, claimCount: 1 },
    },
    media: {
      status: "ready",
      value: { processingCount: 1, failedCount: 1 },
    },
    allFailed: false,
  };
}
