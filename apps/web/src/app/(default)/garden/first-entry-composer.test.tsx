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
      keepWithoutMatch: "Залишити без відповідності",
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
      keepWithoutMatch: "Запазване без съответствие",
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
      keepWithoutMatch: "Оставить без соответствия",
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
    keepWithoutMatch: string;
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
      const html = renderToStaticMarkup(
        <FirstEntryComposer
          ownerUserId="00000000-0000-4000-8000-000000000001"
          locale={locale}
          today="2026-07-16"
          initialClientMutationId="test-mutation"
          requiresFirstPublicationDisclosure
        />,
      );

      expect(html).toContain(expected.name);
      expect(html).toContain(expected.firstUpdate);
      expect(html).toContain(expected.saveOnline);
      expect(html).toContain(expected.region);
      expect(html).toContain(expected.choosePhoto);
      // The name field is the picker (ADR-0026 D7): one control, under the
      // name label, not a plain input above a second one collapsed inside
      // "more details" — which is where the graph was unreachable from.
      expect(html).toMatch(
        new RegExp(
          `${expected.name}</label>[\\s\\S]*?role="combobox"[\\s\\S]*?name="plantName"`,
          "u",
        ),
      );
      expect(html).toContain('data-auth-intent-control="create_object"');
      expect(html).toContain(expected.keepWithoutMatch);
      const details = html.slice(html.indexOf("<details"));
      expect(details).not.toContain('data-catalog-picker="true"');
      expect(html).toContain('type="file"');
      expect(html).toContain('class="hidden"');
      expect(html).toContain('data-photo-picker-control="true"');
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
      />,
    );

    expect(html).not.toContain("Я розумію, що цей запис");
  });
});
