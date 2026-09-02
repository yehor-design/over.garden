import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

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
      saveOnline: "Опублікувати",
      moreDetails: "Більше деталей",
      choosePhoto: "Обрати фото",
    },
  ],
  [
    "bg",
    {
      whatChanged: "Какво се промени?",
      saveOnline: "Публикувай",
      moreDetails: "Повече подробности",
      choosePhoto: "Избор на снимка",
    },
  ],
  [
    "ru",
    {
      whatChanged: "Что изменилось?",
      saveOnline: "Опубликовать",
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
  it("fences every control behind the local-only atomic composer state", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./follow-up-entry-composer.tsx", import.meta.url)),
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
    "localizes follow-up and request-failure recovery in %s without translating authored data",
    (locale, expected) => {
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
          requiresFirstPublicationDisclosure
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
      expect(html).not.toMatch(
        /What changed\?|Save follow-up|Saved follow-ups on this device|More details|Choose File|No file chosen|на цьому пристрої|на това устройство|на этом устройстве|queued|syncing|synced/i,
      );
    },
  );

  it("does not repeat first-publication consent after the owner has disclosed", () => {
    const html = renderToStaticMarkup(
      <FollowUpEntryComposer
        ownerUserId="00000000-0000-4000-8000-000000000001"
        locale="uk"
        objectId="18700003-0000-4000-8000-000000000001"
        objectDisplayName="Rose"
        objectKind="plant"
        today="2026-07-16"
        initialClientMutationId="test-mutation"
        requiresFirstPublicationDisclosure={false}
      />,
    );

    expect(html).not.toContain("Я розумію, що цей запис");
  });
});
