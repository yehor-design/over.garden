import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { failedSection } from "@/server/workspace-failure";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import type { GardenWorkspaceReadModel } from "@/server/garden-workspace-repository";
import { GardenWorkspaceView } from "./garden-workspace-view";

/**
 * The garden home leads with state, not with a menu (`OVE-457` criterion 4).
 *
 * It used to open with a next-action strip and a band of four numbers on an
 * inverted bar — including three noughts for a gardener who had just arrived.
 * What a gardener comes to find out is what needs attention and what they
 * wrote last, in that order, and the order is what these assert.
 */
describe("GardenWorkspaceView", () => {
  it("leads with what needs attention, then what was written last", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={readyWorkspace()}
      />,
    );

    expect(html).toContain('data-garden-workspace="operational-home"');
    // The heading belongs to the shell, which renders before this view exists
    // (ADR-0023). A second <h1> here would be the jump the shell removes.
    expect(html).not.toContain("<h1");

    const attention = html.indexOf('id="attention"');
    const recent = html.indexOf('id="recent"');
    const inventory = html.indexOf('id="inventory"');
    const spaces = html.indexOf('id="spaces"');
    expect(attention).toBeGreaterThan(-1);
    expect(recent).toBeGreaterThan(attention);
    expect(inventory).toBeGreaterThan(recent);
    expect(spaces).toBeGreaterThan(inventory);

    expect(html).toContain("Що потребує уваги");
    expect(html).toContain("Оновіть Object 1");
    expect(html).toContain("Останні події");
    expect(html).toContain("First flowers");
    expect(html).toContain("Живі об");
    expect(html).toContain("Переглянути всі 9 об");
    expect(html).toContain("Простори");
    expect(html).toContain("Переглянути всі 5 просторів");
    expect(html).toContain("Рослини");
    expect(html).not.toContain("Приватні чернетки");
    expect(html).not.toContain("Локальна черга");
    expect(html).toContain("До успішної публікації");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toMatch(
      /owner_user_id|client_mutation_id|quarantine_key|latitude|longitude|private body/i,
    );
  });

  // DESIGN.md §5.10: a count of nought is the absence of a fact. This garden
  // has no animals and the page says nothing about animals.
  it("prints no nought", () => {
    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={noAnimalsWorkspace()}
      />,
    );

    expect(html).toContain("Рослини");
    expect(html).not.toContain("Тварини");
    expect(html).not.toMatch(/>0</u);
  });

  it("says everything is current when nothing is due", () => {
    const workspace = readyWorkspace();
    const inventory = workspace.inventory;
    if (inventory.status !== "ready") throw new Error("fixture");
    inventory.value.objects[0]!.latestEntryDate = new Date(
      "2026-07-11T00:00:00.000Z",
    );

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain("Усе актуальне");
    expect(html).toContain('data-screen-state="empty-first-run"');
  });

  it("keeps healthy sections usable when recent continuity fails", () => {
    const workspace = readyWorkspace();
    workspace.recent = failedSection("query_timeout");

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
    // `OVE-457` criterion 2: one sentence per class, not one for all six.
    expect(html).toContain("Запит тривав довше, ніж дозволено");
    expect(html).toContain('data-section-failure="query_timeout"');
  });

  it("does not present a failed inventory query as an empty garden", () => {
    const workspace = readyWorkspace();
    workspace.inventory = failedSection("schema_missing");

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).not.toContain("Почніть з одного живого об");
    // The bounded class reaches an operator as an attribute, never as copy.
    expect(html).toContain('data-section-failure="schema_missing"');
    expect(html).not.toContain(">schema_missing<");
    // One panel, not two: the attention section carries it and the inventory
    // below renders nothing rather than repeating the same digest.
    expect(html.match(/data-section-failure="schema_missing"/gu)).toHaveLength(
      1,
    );
  });

  it("renders the whole-surface failure as one designed state", () => {
    const workspace = readyWorkspace();
    workspace.inventory = failedSection("connection_unavailable");
    workspace.spaces = failedSection("connection_unavailable");
    workspace.recent = failedSection("connection_unavailable");
    workspace.inbox = failedSection("connection_unavailable");
    workspace.allFailed = true;

    const html = renderToStaticMarkup(
      <GardenWorkspaceView
        canWrite
        locale="uk"
        today="2026-07-12"
        workspace={workspace}
      />,
    );

    expect(html).toContain('data-garden-workspace="error"');
    expect(html).toContain("Дані простору тимчасово недоступні");
    expect(html).toContain('href="/garden"');
    expect(html).toContain("Спробувати ще раз");
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("Object 1");
  });

  it.each([
    ["bg", "Какво чака внимание", "Живи обекти", "Пространства"],
    ["ru", "Что требует внимания", "Живые объекты", "Пространства"],
  ] as const)(
    "renders authored workspace chrome in %s without translating stored values",
    (locale, attention, inventory, spaces) => {
      const html = renderToStaticMarkup(
        <GardenWorkspaceView
          canWrite
          locale={locale}
          today="2026-07-12"
          workspace={readyWorkspace()}
        />,
      );

      expect(html).toContain(attention);
      expect(html).toContain(inventory);
      expect(html).toContain(spaces);
      expect(html).toContain("Object 1");
      expect(html).toContain("Monstera deliciosa");
      expect(html).toContain("First flowers");
    },
  );
});

function noAnimalsWorkspace(): GardenWorkspaceReadModel {
  const workspace = readyWorkspace();
  if (workspace.inventory.status !== "ready") throw new Error("fixture");
  workspace.inventory.value.animalCount = 0;
  return workspace;
}

function readyWorkspace(): GardenWorkspaceReadModel {
  return {
    inventory: {
      status: "ready",
      value: {
        totalCount: 9,
        plantCount: 5,
        animalCount: 2,
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
