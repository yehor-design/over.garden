import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { GardenWorkspaceReadModel } from "@/server/garden-workspace-repository";
import { GardenWorkspaceView } from "./garden-workspace-view";

describe("GardenWorkspaceView", () => {
  it("renders an operational home with mixed inventory and server continuity", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={readyWorkspace()}
      />,
    );

    expect(html).toContain('data-garden-workspace="operational-home"');
    expect(html).toContain(
      'class="grid grid-cols-2 border-b border-border bg-foreground text-background md:grid-cols-4"',
    );
    expect(html).toContain("Простір саду");
    expect(html).toContain("Наступна корисна дія");
    expect(html).toContain("Оновіть Object 1");
    expect(html).toContain("Рослини");
    expect(html).toContain("Тварини");
    expect(html).toContain("Простори");
    expect(html).toContain("Переглянути всі 5 просторів");
    expect(html).toContain("Живі об");
    expect(html).toContain("Переглянути всі 9 об");
    expect(html).not.toContain("Приватні чернетки");
    expect(html).not.toContain("Локальна черга");
    expect(html).toContain("До успішної публікації");
    expect(html).toContain("Останні події");
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
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain("Живі об");
    expect(html).toContain("Object 1");
    expect(html).toContain("Останні оновлення тимчасово недоступні");
    expect(html).toContain("Спробувати цей розділ ще раз");
  });

  it("renders one recoverable full-error state inside the shared shell content", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={{
          inventory: { status: "error" },
          spaces: { status: "error" },
          recent: { status: "error" },
          inbox: { status: "error" },
          allFailed: true,
        }}
      />,
    );

    expect(html).toContain("Дані простору тимчасово недоступні");
    expect(html).toContain('href="/garden"');
    expect(html).toContain("Спробувати ще раз");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("Object 1");
  });

  it("does not present a failed inventory query as an empty garden", () => {
    const workspace = readyWorkspace();
    workspace.inventory = { status: "error" };

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain("Відновіть список живих об");
    expect(html).toContain("Оновити список");
    expect(html).not.toContain("Почніть з одного живого об");
  });

  it.each([
    ["bg", "Следващо полезно действие", "Живи обекти", "Пространства"],
    ["ru", "Следующее полезное действие", "Живые объекты", "Пространства"],
  ] as const)(
    "renders authored workspace chrome in %s without translating stored values",
    (locale, nextAction, inventory, spaces) => {
      const html = renderToStaticMarkup(
        <GardenWorkspaceView
          canWrite
          locale={locale}
          today="2026-07-12"
          workspace={readyWorkspace()}
        />,
      );

      expect(html).toContain(nextAction);
      expect(html).toContain(inventory);
      expect(html).toContain(spaces);
      expect(html).toContain("Object 1");
      expect(html).toContain("Monstera deliciosa");
      expect(html).toContain("First flowers");
    },
  );
});

function readyWorkspace(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 9,
        plantCount: 5,
        animalCount: 2,
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
            archivedEntryCount: 0,
            latestEntryDate: new Date("2026-06-01T00:00:00.000Z"),
            coverMedia: {
              publicUrl: "http://localhost:9000/fixture/object-1.png",
              altText: "Monstera leaves",
              focalX: 0.5,
              focalY: 0.5,
              intrinsicWidth: 800,
              intrinsicHeight: 600,
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
          visibility: "public",
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
    allFailed: false,
  };
}
