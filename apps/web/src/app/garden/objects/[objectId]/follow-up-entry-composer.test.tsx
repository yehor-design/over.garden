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

import { FollowUpEntryComposer } from "./follow-up-entry-composer";

const localeExpectations = [
  [
    "uk",
    {
      whatChanged: "Що змінилося?",
      saveOnline: "Зберегти продовження",
      moreDetails: "Більше деталей",
      choosePhoto: "Обрати фото",
    },
  ],
  [
    "bg",
    {
      whatChanged: "Какво се промени?",
      saveOnline: "Запазване на продължението",
      moreDetails: "Повече подробности",
      choosePhoto: "Избор на снимка",
    },
  ],
  [
    "ru",
    {
      whatChanged: "Что изменилось?",
      saveOnline: "Сохранить продолжение",
      moreDetails: "Больше подробностей",
      choosePhoto: "Выбрать фото",
    },
  ],
] as const satisfies readonly [
  InterfaceLocale,
  {
    whatChanged: string;
    saveOnline: string;
    moreDetails: string;
    choosePhoto: string;
  },
][];

describe("follow-up entry composer localization", () => {
  it("fences every control behind the shared online composer state", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./follow-up-entry-composer.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("useOnlineJournalComposer({");
    expect(source).toContain(
      '<fieldset disabled={persistenceFrozen} className="contents">',
    );
    expect(source).toContain("disabled={persistenceFrozen}");
    expect(source).not.toMatch(
      /navigator\.onLine|["']online["']\s*,\s*handle|@\/lib\/offline/u,
    );
  });

  it.each(localeExpectations)(
    "localizes follow-up and request-failure recovery in %s without translating authored data",
    (locale, expected) => {
      const scenario = visualScenario();
      const objectDisplayName = "Apis mellifera — Кошер № 7";
      const html = renderToStaticMarkup(
        <FollowUpEntryComposer
          ownerUserId="00000000-0000-4000-8000-000000000001"
          locale={locale}
          objectId="18700003-0000-4000-8000-000000000001"
          objectDisplayName={objectDisplayName}
          objectKind="animal"
          today="2026-07-16"
          initialClientMutationId="test-mutation"
          visualScenario={scenario}
        />,
      );

      expect(html).toContain(expected.whatChanged);
      expect(html).toContain(expected.saveOnline);
      expect(html).toContain(expected.moreDetails);
      expect(html).toContain(expected.choosePhoto);
      expect(html).toContain('type="file"');
      expect(html).toContain('class="hidden"');
      expect(html).toContain('data-photo-picker-control="true"');
      expect(html).toContain(objectDisplayName);
      expect(html).toContain(scenario.entryTitle);
      expect(html).toContain(scenario.entryBody);
      expect(html).not.toContain(scenario.message);
      expect(html).not.toMatch(
        /What changed\?|Save follow-up|Saved follow-ups on this device|More details|Choose File|No file chosen|на цьому пристрої|на това устройство|на этом устройстве|queued|syncing|synced/i,
      );
    },
  );
});

function visualScenario(): VisualFixtureCreationScenarioEvidence {
  return {
    id: "ove182-c019",
    flow: "follow-up",
    state: "connection-required",
    label: "Fixture label is operator evidence",
    ownerActorId: "owner",
    objectId: "18700003-0000-4000-8000-000000000001",
    spaceId: "space",
    spaceName: "Пасіка",
    objectKind: "animal",
    objectName: "Apis mellifera — Кошер № 7",
    entryTitle: "User-authored follow-up title",
    entryBody: "Оригінальний текст користувача лишається без перекладу.",
    entryDate: "2026-07-16",
    catalogQuery: "",
    userAddedCatalogName: null,
    locationVisibility: "hidden",
    coarseRegionCode: null,
    topicTagInput: "огляд, queen",
    mediaFileName: null,
    serverAvailable: false,
    submitState: "connection_required",
    message: "This raw fixture message must never reach the localized UI.",
    detailsOpen: true,
    path: "/garden/objects/18700003-0000-4000-8000-000000000001",
    startPath: "/garden/objects/18700003-0000-4000-8000-000000000001",
    payloadClass: "follow_up",
    clientMutationId: "visual-mutation",
    preconditionEntryIds: [],
    expectedSpaceId: "space",
    expectedObjectId: "18700003-0000-4000-8000-000000000001",
    expectedEntryId: "expected-entry",
    expectedMediaAssetIds: [],
    expectedServerWrite: false,
    expectedEntryVisibility: "private",
    postSavePath: null,
    resetOwnedSpaceIds: [],
    resetOwnedObjectIds: [],
    resetOwnedEntryIds: [],
    resetOwnedMediaAssetIds: [],
    expectedStatus: 200,
    viewportTargets: ["desktop", "mobile-320"],
  };
}
