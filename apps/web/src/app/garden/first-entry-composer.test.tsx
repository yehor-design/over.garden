import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import type { VisualFixtureCreationScenarioEvidence } from "@/lib/visual-fixtures/manifest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { FirstEntryComposer } from "./first-entry-composer";

const localeExpectations = [
  [
    "uk",
    {
      name: "Назва",
      firstUpdate: "Перше оновлення",
      saveOnline: "Опублікувати",
      region: "Київ",
      choosePhoto: "Обрати фото",
    },
  ],
  [
    "bg",
    {
      name: "Име",
      firstUpdate: "Първо обновяване",
      saveOnline: "Публикувай",
      region: "Киев",
      choosePhoto: "Избор на снимка",
    },
  ],
  [
    "ru",
    {
      name: "Название",
      firstUpdate: "Первое обновление",
      saveOnline: "Опубликовать",
      region: "Киев",
      choosePhoto: "Выбрать фото",
    },
  ],
] as const satisfies readonly [
  InterfaceLocale,
  {
    name: string;
    firstUpdate: string;
    saveOnline: string;
    region: string;
    choosePhoto: string;
  },
][];

describe("first entry composer localization", () => {
  it("fences every control behind the local-only atomic composer state", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./first-entry-composer.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("useLocalJournalComposer({");
    expect(source).toContain('imageInsertionMode="immediate"');
    expect(source).toContain("LocalJournalPublicationDisclosure");
    expect(source).toContain(
      '<fieldset disabled={persistenceFrozen} className="contents">',
    );
    expect(source).toContain("disabled={persistenceFrozen}");
    expect(source).not.toMatch(
      /navigator\.onLine|["']online["']\s*,\s*handle|@\/lib\/offline/u,
    );
    expect(source).not.toMatch(
      /use-online-journal-composer|online-journal-submit|use-inline-media-selection|createComposerPhotoIntent/u,
    );
  });

  it.each(localeExpectations)(
    "localizes creation and request-failure recovery in %s without translating authored data",
    (locale, expected) => {
      const scenario = visualScenario();
      const html = renderToStaticMarkup(
        <FirstEntryComposer
          ownerUserId="00000000-0000-4000-8000-000000000001"
          locale={locale}
          today="2026-07-16"
          initialClientMutationId="test-mutation"
          requiresFirstPublicationDisclosure
          visualScenario={scenario}
        />,
      );

      expect(html).toContain(expected.name);
      expect(html).toContain(expected.firstUpdate);
      expect(html).toContain(expected.saveOnline);
      expect(html).toContain(expected.region);
      expect(html).toContain(expected.choosePhoto);
      expect(html).toContain('type="file"');
      expect(html).toContain('class="hidden"');
      expect(html).toContain('data-photo-picker-control="true"');
      expect(html).toContain(scenario.objectName.replaceAll("'", "&#x27;"));
      expect(html).toContain(scenario.spaceName);
      expect(html).toContain(scenario.entryBody);
      expect(html).toContain(scenario.userAddedCatalogName);
      expect(html).not.toContain(scenario.message);
      expect(html).toMatch(
        /data-composer-details-content="true" class="mt-4 grid min-w-0 gap-4"/,
      );
      expect(html).toMatch(
        /data-composer-details-grid="location" class="grid min-w-0 gap-3 sm:grid-cols-2"/,
      );
      expect(html).toMatch(
        /data-composer-details-grid="entry-metadata" class="grid min-w-0 gap-3 sm:grid-cols-3"/,
      );
      expect(html).not.toMatch(
        /Save first entry|More details|Mention suggestions unavailable|Choose File|No file chosen|на цьому пристрої|на това устройство|на этом устройстве|queued|syncing|synced/i,
      );
    },
  );

  it("does not repeat first-publication consent after the owner has disclosed", () => {
    const html = renderToStaticMarkup(
      <FirstEntryComposer
        ownerUserId="00000000-0000-4000-8000-000000000001"
        locale="uk"
        today="2026-07-16"
        initialClientMutationId="test-mutation"
        requiresFirstPublicationDisclosure={false}
        visualScenario={visualScenario()}
      />,
    );

    expect(html).not.toContain("Я розумію, що цей запис");
  });
});

function visualScenario(): VisualFixtureCreationScenarioEvidence {
  return {
    id: "localized-connection-required",
    flow: "first-entry",
    state: "connection-required",
    label: "Fixture label is operator evidence",
    ownerActorId: "owner",
    objectId: null,
    spaceId: null,
    spaceName: "Балконна оранжерея",
    objectKind: "plant",
    objectName: "Lavandula 'Hidcote'",
    entryTitle: "Перший запис користувача",
    entryBody: "User-authored note remains exactly as entered.",
    entryDate: "2026-07-16",
    catalogQuery: "Lavandula",
    userAddedCatalogName: "Lavandula локальна назва",
    locationVisibility: "region",
    coarseRegionCode: "UA-30",
    topicTagInput: "полив, balcony",
    mediaFileName: null,
    serverAvailable: false,
    submitState: "connection_required",
    message: "This raw fixture message must never reach the localized UI.",
    detailsOpen: true,
    path: "/garden",
    startPath: "/garden",
    payloadClass: "first_entry",
    clientMutationId: "visual-mutation",
    preconditionEntryIds: [],
    expectedSpaceId: "expected-space",
    expectedObjectId: "expected-object",
    expectedEntryId: "expected-entry",
    expectedMediaAssetIds: [],
    expectedServerWrite: false,
    expectedEntryVisibility: "public",
    postSavePath: null,
    resetOwnedSpaceIds: [],
    resetOwnedObjectIds: [],
    resetOwnedEntryIds: [],
    resetOwnedMediaAssetIds: [],
    expectedStatus: 200,
    viewportTargets: ["desktop", "mobile-320"],
  };
}
