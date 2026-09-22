import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";
import type { OwnedDestination } from "@/lib/garden/owned-destinations";
import { localCalendarDate } from "@/lib/entry-composer-copy";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import { EntryComposer } from "./entry-composer";

const beehive: OwnedDestination = {
  kind: "object",
  id: "18700003-0000-4000-8000-000000000001",
  displayName: "Apis mellifera — Кошер № 7",
  objectKind: "animal",
  parent: { id: "18700003-0000-4000-8000-000000000009", displayName: "Пасіка" },
  species: "Apis mellifera",
};

const balcony: OwnedDestination = {
  kind: "space",
  id: "18700003-0000-4000-8000-000000000010",
  displayName: "Балкон",
};

const localeExpectations = [
  [
    "uk",
    {
      whatChanged: "Що змінилося?",
      publish: "Опублікувати",
      moreDetails: "Більше деталей",
      choosePhoto: "Обрати фото",
      date: "Дата спостереження",
      writingTo: "Запис у",
    },
  ],
  [
    "bg",
    {
      whatChanged: "Какво се промени?",
      publish: "Публикувай",
      moreDetails: "Повече подробности",
      choosePhoto: "Избор на снимка",
      date: "Дата на наблюдението",
      writingTo: "Запис в",
    },
  ],
  [
    "ru",
    {
      whatChanged: "Что изменилось?",
      publish: "Опубликовать",
      moreDetails: "Больше подробностей",
      choosePhoto: "Выбрать фото",
      date: "Дата наблюдения",
      writingTo: "Запись в",
    },
  ],
] as const satisfies readonly [InterfaceLocale, Record<string, string>][];

describe("the one entry composer (OVE-486)", () => {
  it("fences every control behind the local-only atomic composer state", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./entry-composer.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("useLocalJournalComposer({");
    expect(source).toContain('imageInsertionMode="immediate"');
    expect(source).toContain("LocalJournalPublicationDisclosure");
    expect(source).toContain(
      '<fieldset disabled={persistenceFrozen} className="contents">',
    );
    expect(source).not.toMatch(
      /navigator\.onLine|["']online["']\s*,\s*handle|@\/lib\/offline|indexedDB|localStorage/u,
    );
    expect(source).not.toMatch(
      /use-online-journal-composer|online-journal-submit|use-inline-media-selection|createComposerPhotoIntent/u,
    );
  });

  it.each(localeExpectations)(
    "names the destination, the date and public visibility first in %s",
    (locale, expected) => {
      const html = renderToStaticMarkup(
        <EntryComposer
          locale={locale}
          initialDestination={beehive}
          today="2026-07-16"
          requiresFirstPublicationDisclosure
        />,
      );
      // Where, when and who can see it, before the text.
      const destinationAt = html.indexOf(
        'data-entry-composer-destination="true"',
      );
      expect(destinationAt).toBeGreaterThan(-1);
      expect(destinationAt).toBeLessThan(html.indexOf(expected.whatChanged));
      expect(html).toContain(expected.writingTo);
      expect(html).toContain(beehive.displayName);
      expect(html).toContain(expected.date);
      expect(html).toContain('data-entry-composer-visibility="public"');
      expect(html).toContain('value="2026-07-16"');
      expect(html).toContain(expected.publish);
      expect(html).toContain(expected.moreDetails);
      expect(html).toContain(expected.choosePhoto);
      expect(html).toContain('data-photo-picker-control="true"');
      // A contextual launch does not ask where again.
      expect(html).not.toContain("data-owned-destination-picker");
      expect(html).not.toMatch(
        /Saved follow-ups on this device|на цьому пристрої|на това устройство|на этом устройстве|queued|syncing|autosave|чернетк/i,
      );
    },
  );

  it("opens the owned-destination picker at once when launched with nothing chosen", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={null}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain("data-owned-destination-picker");
    expect(html).toContain("Куди записати?");
  });

  it("asks a space entry which of the space's objects it mentions", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[
          { id: "18700003-0000-4000-8000-000000000011", displayName: "Томат" },
          {
            id: "18700003-0000-4000-8000-000000000012",
            displayName: "Базилік",
          },
        ]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain('data-entry-composer-mentions="true"');
    expect(html).toContain("Про кого цей запис?");
    expect(html).toContain("Томат");
    expect(html).toContain("Базилік");
    expect(html).toContain("Що відбувається в цьому просторі?");
  });

  it("says so, and offers to add one, when a space has no objects to mention", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={balcony}
        initialSpaceObjects={[]}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).toContain('data-entry-composer-space-empty="true"');
    expect(html).toContain(`/garden/objects/new?space=${balcony.id}`);
  });

  it("does not repeat first-publication consent after the owner has disclosed", () => {
    const html = renderToStaticMarkup(
      <EntryComposer
        locale="uk"
        initialDestination={beehive}
        today="2026-07-16"
        requiresFirstPublicationDisclosure={false}
      />,
    );
    expect(html).not.toContain("Я розумію, що цей запис");
  });

  it("dates an entry by the reader's own calendar, not the UTC day", () => {
    // 01:30 on 17 July in Kyiv is still 16 July in UTC.
    const kyivNight = new Date(2026, 6, 17, 1, 30);
    expect(localCalendarDate(kyivNight)).toBe("2026-07-17");
  });
});
