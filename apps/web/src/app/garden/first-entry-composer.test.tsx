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
      saveOffline: "Зберегти на цьому пристрої",
      region: "Київ",
      choosePhoto: "Обрати фото",
    },
  ],
  [
    "bg",
    {
      name: "Име",
      firstUpdate: "Първо обновяване",
      saveOffline: "Запазване на това устройство",
      region: "Киев",
      choosePhoto: "Избор на снимка",
    },
  ],
  [
    "ru",
    {
      name: "Название",
      firstUpdate: "Первое обновление",
      saveOffline: "Сохранить на этом устройстве",
      region: "Киев",
      choosePhoto: "Выбрать фото",
    },
  ],
] as const satisfies readonly [
  InterfaceLocale,
  {
    name: string;
    firstUpdate: string;
    saveOffline: string;
    region: string;
    choosePhoto: string;
  },
][];

describe("first entry composer localization", () => {
  it.each(localeExpectations)(
    "localizes creation and offline recovery in %s without translating authored data",
    (locale, expected) => {
      const scenario = visualScenario();
      const html = renderToStaticMarkup(
        <FirstEntryComposer
          ownerUserId="00000000-0000-4000-8000-000000000001"
          locale={locale}
          today="2026-07-16"
          initialClientMutationId="test-mutation"
          visualScenario={scenario}
        />,
      );

      expect(html).toContain(expected.name);
      expect(html).toContain(expected.firstUpdate);
      expect(html).toContain(expected.saveOffline);
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
        /Save first entry|More details|Mention suggestions unavailable|Choose File|No file chosen/i,
      );
    },
  );
});

function visualScenario(): VisualFixtureCreationScenarioEvidence {
  return {
    id: "localized-offline",
    flow: "first-entry",
    state: "offline",
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
    online: false,
    submitState: "queued",
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
    expectedEntryVisibility: "private",
    postSavePath: null,
    resetOwnedSpaceIds: [],
    resetOwnedObjectIds: [],
    resetOwnedEntryIds: [],
    resetOwnedMediaAssetIds: [],
    dexieDraftKey: "visual-draft",
    expectedStatus: 200,
    viewportTargets: ["desktop", "mobile-320"],
  };
}
