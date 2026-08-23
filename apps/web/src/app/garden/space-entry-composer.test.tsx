import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/interface-localization";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { SpaceEntryComposer } from "./space-entry-composer";

describe("space entry atomic create surface", () => {
  it("uses the same local-only atomic owner as the other create callers", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./space-entry-composer.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("useLocalJournalComposer({");
    expect(source).toContain('imageInsertionMode="immediate"');
    expect(source).toContain("LocalJournalPublicationDisclosure");
    expect(source).not.toMatch(
      /use-online-journal-composer|online-journal-submit|use-inline-media-selection|createComposerPhotoIntent/u,
    );
  });

  it.each([
    ["uk", "Опублікувати", "одразу стануть публічними"],
    ["bg", "Публикувай", "веднага ще станат публични"],
    ["ru", "Опубликовать", "сразу станут публичными"],
  ] as const)(
    "localizes the one public action and disclosure in %s",
    (locale, publish, disclosure) => {
      const html = renderToStaticMarkup(
        <SpaceEntryComposer
          locale={locale as InterfaceLocale}
          ownerUserId="00000000-0000-4000-8000-000000000001"
          spaceId="00000000-0000-4000-8000-000000000002"
          today="2026-08-23"
          requiresFirstPublicationDisclosure
          objects={[
            {
              id: "00000000-0000-4000-8000-000000000003",
              displayName: "Authored Rosa",
              objectKindLabel: "Authored kind",
            },
          ]}
        />,
      );
      expect(html).toContain(publish);
      expect(html).toContain(disclosure);
      expect(html).toContain("Authored Rosa");
      expect(html).not.toMatch(/server.*draft|серверн.*черн|частн.*запис/i);
    },
  );

  it("does not repeat first-publication consent after the owner has disclosed", () => {
    const html = renderToStaticMarkup(
      <SpaceEntryComposer
        locale="uk"
        ownerUserId="00000000-0000-4000-8000-000000000001"
        spaceId="00000000-0000-4000-8000-000000000002"
        today="2026-08-23"
        requiresFirstPublicationDisclosure={false}
        objects={[
          {
            id: "00000000-0000-4000-8000-000000000003",
            displayName: "Authored Rosa",
            objectKindLabel: "Authored kind",
          },
        ]}
      />,
    );

    expect(html).not.toContain("Я розумію, що цей запис");
  });
});
